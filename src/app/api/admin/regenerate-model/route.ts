import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, conversionJobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { safeUpgradeFloorPlanDoc, isFloorPlanDocV3 } from "@/lib/floorplan/types";
import { uploadModel } from "@/lib/storage";
import type { GenerationSettings } from "@/lib/floorplan/convert-to-3d";

export const runtime = "nodejs";

// Dev-only: regenerate and overwrite the stored model for a project.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string;
      settings?: GenerationSettings;
    };

    const projectId = body.projectId;
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const [project] = await db
      .select({
        id: projects.id,
        userId: projects.userId,
        floorPlanData: projects.floorPlanData,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.floorPlanData) {
      return NextResponse.json(
        { error: "Project has no floor plan data" },
        { status: 400 }
      );
    }

    const { doc } = safeUpgradeFloorPlanDoc(project.floorPlanData);
    if (!isFloorPlanDocV3(doc)) {
      return NextResponse.json({ error: "Invalid floor plan data" }, { status: 400 });
    }
    if (doc.walls.length === 0) {
      return NextResponse.json(
        { error: "Floor plan has no walls to convert" },
        { status: 400 }
      );
    }

    const { convertFloorPlanTo3D, exportToGLB } = await import(
      "@/lib/floorplan/convert-to-3d"
    );
    const { scene } = convertFloorPlanTo3D(doc, body.settings);
    const glb = await exportToGLB(scene);

    const modelUrl = await uploadModel(project.userId, projectId, Buffer.from(glb));

    await db
      .update(projects)
      .set({ modelUrl, status: "COMPLETE", updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    // Best-effort: update latest conversion job record if it exists.
    try {
      const [job] = await db
        .select({ id: conversionJobs.id })
        .from(conversionJobs)
        .where(eq(conversionJobs.projectId, projectId))
        .orderBy(desc(conversionJobs.createdAt))
        .limit(1);
      if (job?.id) {
        await db
          .update(conversionJobs)
          .set({ status: "COMPLETE", modelUrl, finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(conversionJobs.id, job.id));
      }
    } catch {
      // ignore if table missing or query fails
    }

    return NextResponse.json({ success: true, modelUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

