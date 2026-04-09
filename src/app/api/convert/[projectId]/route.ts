import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, conversionJobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";
import {
  useCredits as deductCredits,
  addCredits,
  CREDIT_COSTS,
} from "@/lib/credits";
import { safeUpgradeFloorPlanDoc, isFloorPlanDocV3 } from "@/lib/floorplan/types";
import type { GenerationSettings } from "@/lib/floorplan/convert-to-3d";
import { uploadModel, storage } from "@/lib/storage";

export const runtime = "nodejs";

function isMissingRelation(err: unknown) {
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  const c = e?.cause as { code?: unknown; message?: unknown } | undefined;
  const code = (c?.code ?? e?.code) as unknown;
  return code === "42P01"; // undefined_table
}

function clampNum(n: unknown, min: number, max: number): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function parseGenerationSettings(raw: unknown): GenerationSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const wallHeight = clampNum(r.wallHeight, 1.8, 6.0);
  const wallColor =
    typeof r.wallColor === "number" && Number.isFinite(r.wallColor)
      ? (r.wallColor >>> 0) & 0xffffff
      : undefined;
  const floorColor =
    typeof r.floorColor === "number" && Number.isFinite(r.floorColor)
      ? (r.floorColor >>> 0) & 0xffffff
      : undefined;
  const ceilingColor =
    typeof r.ceilingColor === "number" && Number.isFinite(r.ceilingColor)
      ? (r.ceilingColor >>> 0) & 0xffffff
      : undefined;
  const includeCeiling =
    typeof r.includeCeiling === "boolean" ? r.includeCeiling : undefined;

  const out: GenerationSettings = {};
  if (wallHeight !== undefined) out.wallHeight = wallHeight;
  if (wallColor !== undefined) out.wallColor = wallColor;
  if (floorColor !== undefined) out.floorColor = floorColor;
  if (ceilingColor !== undefined) out.ceilingColor = ceilingColor;
  if (includeCeiling !== undefined) out.includeCeiling = includeCeiling;
  return Object.keys(out).length ? out : undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { settings?: unknown; enqueueOnly?: boolean; mode?: "floorplan" | "image" }
    | null;
  const settings = parseGenerationSettings(body?.settings);
  const enqueueOnly = Boolean(body?.enqueueOnly);
  const mode: "floorplan" | "image" = body?.mode === "image" ? "image" : "floorplan";

  let deducted = false;
  let jobId: string | null = null;

  try {
    await ensureDbUser();

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [project] = await db
      .select({
        id: projects.id,
        floorPlanData: projects.floorPlanData,
        status: projects.status,
        userId: projects.userId,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (mode === "image" && !enqueueOnly) {
      return NextResponse.json(
        {
          error: "Image conversion is queued-only for now. Enable Queue only (dev) or use the Queue action in Upload.",
        },
        { status: 501 }
      );
    }

    if (mode === "image" && !process.env.AI_SERVICE_URL) {
      return NextResponse.json(
        { error: "AI service is not configured (set AI_SERVICE_URL)" },
        { status: 501 }
      );
    }

    if (mode === "floorplan" && enqueueOnly && !project.floorPlanData) {
      return NextResponse.json(
        { error: "Project has no floor plan data" },
        { status: 400 }
      );
    }

    if (mode === "image" && enqueueOnly) {
      const imageKey = `ref-${projectId}`;
      const imageData = await storage.download(imageKey);
      if (!imageData) {
        return NextResponse.json(
          { error: "No reference image uploaded" },
          { status: 400 }
        );
      }
    }

    if (mode === "floorplan" && !project.floorPlanData) {
      return NextResponse.json(
        { error: "Project has no floor plan data" },
        { status: 400 }
      );
    }

    let doc: ReturnType<typeof safeUpgradeFloorPlanDoc>["doc"] | null = null;
    let wasCorrupt = false;
    if (mode === "floorplan") {
      const upgraded = safeUpgradeFloorPlanDoc(project.floorPlanData);
      doc = upgraded.doc;
      wasCorrupt = upgraded.wasCorrupt;
      if (!isFloorPlanDocV3(doc)) {
        return NextResponse.json(
          { error: "Invalid floor plan data" },
          { status: 400 }
        );
      }
      if (doc.walls.length === 0) {
        return NextResponse.json(
          { error: "Floor plan has no walls to convert" },
          { status: 400 }
        );
      }
    } else {
      const imageKey = `ref-${projectId}`;
      const imageData = await storage.download(imageKey);
      if (!imageData) {
        return NextResponse.json(
          { error: "No reference image uploaded" },
          { status: 400 }
        );
      }
    }

    // Deduct credits (refund on failure below)
    try {
      await deductCredits(userId, CREDIT_COSTS.AI_CONVERSION, "ai_conversion");
      deducted = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Credit deduction failed";
      return NextResponse.json({ error: msg }, { status: 402 });
    }

    // Create a conversion job (QUEUED by default).
    // If the table doesn't exist yet, we fall back to the synchronous path without job tracking.
    try {
      const [job] = await db
        .insert(conversionJobs)
        .values({
          projectId,
          userId,
          status: "QUEUED",
          mode,
          settings: settings ?? null,
        })
        .returning({ id: conversionJobs.id });
      jobId = job?.id ?? null;
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
    }

    if (enqueueOnly) {
      // Mark project as queued and return immediately. A worker can later process queued jobs.
      await db
        .update(projects)
        .set({
          status: "QUEUED",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      return NextResponse.json({
        success: true,
        status: "QUEUED",
        jobId,
      });
    }

    // Update project/job status to PROCESSING and run conversion synchronously.
    await db
      .update(projects)
      .set({
        status: "PROCESSING",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    if (jobId) {
      try {
        await db
          .update(conversionJobs)
          .set({
            status: "PROCESSING",
            startedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(conversionJobs.id, jobId));
      } catch (err) {
        if (!isMissingRelation(err)) throw err;
      }
    }

    // Generate and store the GLB server-side.
    const { convertFloorPlanTo3D, exportToGLB } = await import(
      "@/lib/floorplan/convert-to-3d"
    );
    if (!doc) {
      return NextResponse.json({ error: "No floor plan data" }, { status: 400 });
    }
    const { scene } = convertFloorPlanTo3D(doc, settings);
    const glb = await exportToGLB(scene);
    const modelUrl = await uploadModel(userId, projectId, Buffer.from(glb));

    await db
      .update(projects)
      .set({
        status: "COMPLETE",
        modelUrl,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    if (jobId) {
      try {
        await db
          .update(conversionJobs)
          .set({
            status: "COMPLETE",
            modelUrl,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(conversionJobs.id, jobId));
      } catch (err) {
        if (!isMissingRelation(err)) throw err;
      }
    }

    return NextResponse.json({
      success: true,
      status: "COMPLETE",
      modelUrl,
      jobId,
      wasCorrupt,
    });
  } catch (err) {
    console.error("/api/convert POST failed", err);
    try {
      await db
        .update(projects)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    } catch (e) {
      console.error("Failed to mark project FAILED", e);
    }

    if (jobId) {
      try {
        await db
          .update(conversionJobs)
          .set({
            status: "FAILED",
            error: err instanceof Error ? err.message : "Conversion failed",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(conversionJobs.id, jobId));
      } catch (e) {
        if (!isMissingRelation(e)) {
          console.error("Failed to mark conversion job FAILED", e);
        }
      }
    }

    // Best-effort refund. If the refund fails, we still return 500.
    if (deducted) {
      try {
        await addCredits(
          userId,
          CREDIT_COSTS.AI_CONVERSION,
          "ai_conversion_refund"
        );
      } catch (e) {
        console.error("Failed to refund credits after conversion failure", e);
      }
    }
    return NextResponse.json(
      { error: "Conversion failed" },
      { status: 500 }
    );
  }
}

// GET endpoint to check conversion status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [project] = await db
      .select({
        id: projects.id,
        status: projects.status,
        modelUrl: projects.modelUrl,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let job:
      | { id: string; status: string; mode: string; error: string | null; startedAt: Date | null; finishedAt: Date | null }
      | null = null;
    try {
      const [j] = await db
        .select({
          id: conversionJobs.id,
          status: conversionJobs.status,
          mode: conversionJobs.mode,
          error: conversionJobs.error,
          startedAt: conversionJobs.startedAt,
          finishedAt: conversionJobs.finishedAt,
        })
        .from(conversionJobs)
        .where(eq(conversionJobs.projectId, projectId))
        .orderBy(desc(conversionJobs.createdAt))
        .limit(1);
      job = j ?? null;
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
    }

    return NextResponse.json({
      status: project.status,
      modelUrl: project.modelUrl,
      job,
    });
  } catch (err) {
    console.error("/api/convert GET failed", err);
    return NextResponse.json(
      { error: "Status check failed" },
      { status: 500 }
    );
  }
}
