import { db } from "@/lib/db";
import { conversionJobs, projects } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { safeUpgradeFloorPlanDoc, isFloorPlanDocV3 } from "@/lib/floorplan/types";
import { uploadModel } from "@/lib/storage";
import { addCredits, CREDIT_COSTS } from "@/lib/credits";
import { callAiConvert } from "@/lib/ai/client";
import { loadReferenceImageDataUrl } from "@/lib/ai/reference-image";
import type { GenerationSettings } from "@/lib/floorplan/convert-to-3d";

function clampNum(n: unknown, min: number, max: number): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSettings(raw: unknown): GenerationSettings | undefined {
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

export type ProcessedJob = {
  jobId: string;
  projectId: string;
  status: "COMPLETE" | "FAILED";
  modelUrl?: string;
};

export async function processQueuedConversionJobs({
  limit,
  userId,
}: {
  limit: number;
  userId?: string;
}): Promise<ProcessedJob[]> {
  const processed: ProcessedJob[] = [];
  const clamped = Math.max(1, Math.min(10, Math.floor(limit)));

  for (let i = 0; i < clamped; i++) {
    const where = userId
      ? and(eq(conversionJobs.status, "QUEUED"), eq(conversionJobs.userId, userId))
      : eq(conversionJobs.status, "QUEUED");

    const [job] = await db
      .select({
        id: conversionJobs.id,
        projectId: conversionJobs.projectId,
        userId: conversionJobs.userId,
        mode: conversionJobs.mode,
        settings: conversionJobs.settings,
      })
      .from(conversionJobs)
      .where(where)
      .orderBy(asc(conversionJobs.createdAt))
      .limit(1);

    if (!job) break;

    try {
      await db
        .update(conversionJobs)
        .set({ status: "PROCESSING", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(conversionJobs.id, job.id));

      await db
        .update(projects)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(projects.id, job.projectId));

      const [project] = await db
        .select({
          id: projects.id,
          floorPlanData: projects.floorPlanData,
        })
        .from(projects)
        .where(and(eq(projects.id, job.projectId), eq(projects.userId, job.userId)))
        .limit(1);

      let doc: ReturnType<typeof safeUpgradeFloorPlanDoc>["doc"] | null = null;

      if (job.mode === "floorplan") {
        if (!project?.floorPlanData) throw new Error("Missing floor plan data");
        const upgraded = safeUpgradeFloorPlanDoc(project.floorPlanData);
        doc = upgraded.doc;
        if (!isFloorPlanDocV3(doc)) throw new Error("Invalid floor plan doc");
      } else {
        const dataUrl = await loadReferenceImageDataUrl(job.projectId);
        if (!dataUrl) throw new Error("Missing reference image");

        const result = await callAiConvert({ imageDataUrl: dataUrl });
        const geometry = result?.geometry as { floorPlan?: unknown } | undefined;
        const floorPlan = geometry?.floorPlan ?? project?.floorPlanData ?? null;
        if (!floorPlan) {
          throw new Error("AI response missing floorPlan");
        }
        const upgraded = safeUpgradeFloorPlanDoc(floorPlan);
        doc = upgraded.doc;
        if (!isFloorPlanDocV3(doc)) throw new Error("Invalid floor plan doc");

        await db
          .update(projects)
          .set({ floorPlanData: doc, updatedAt: new Date() })
          .where(eq(projects.id, job.projectId));
      }

      const { convertFloorPlanTo3D, exportToGLB } = await import(
        "@/lib/floorplan/convert-to-3d"
      );
      if (!doc) throw new Error("No floor plan data");
      const { scene } = convertFloorPlanTo3D(doc, sanitizeSettings(job.settings));
      const glb = await exportToGLB(scene);
      const modelUrl = await uploadModel(job.userId, job.projectId, Buffer.from(glb));

      await db
        .update(projects)
        .set({ status: "COMPLETE", modelUrl, updatedAt: new Date() })
        .where(eq(projects.id, job.projectId));

      await db
        .update(conversionJobs)
        .set({
          status: "COMPLETE",
          modelUrl,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversionJobs.id, job.id));

      processed.push({ jobId: job.id, projectId: job.projectId, status: "COMPLETE", modelUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      await db
        .update(projects)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(projects.id, job.projectId));
      await db
        .update(conversionJobs)
        .set({
          status: "FAILED",
          error: msg,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversionJobs.id, job.id));

      try {
        await addCredits(job.userId, CREDIT_COSTS.AI_CONVERSION, "ai_conversion_refund");
      } catch {
        // ignore
      }

      processed.push({ jobId: job.id, projectId: job.projectId, status: "FAILED" });
    }
  }

  return processed;
}
