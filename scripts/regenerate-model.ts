import "dotenv/config";

import { db } from "@/lib/db";
import { conversionJobs, projects } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { safeUpgradeFloorPlanDoc, isFloorPlanDocV3 } from "@/lib/floorplan/types";
import { uploadModel } from "@/lib/storage";
import { processQueuedConversionJobs } from "@/lib/conversion/worker";

function usage() {
  console.error("Usage: npx tsx scripts/regenerate-model.ts <projectId>");
  process.exit(2);
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) usage();
  if (projectId === "--queue") {
    const limit = Number(process.argv[3] ?? 1);
    if (!Number.isFinite(limit) || limit <= 0) usage();
    const processed = await processQueuedConversionJobs({ limit });
    console.log(JSON.stringify({ ok: true, processed }));
    return;
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
    throw new Error(`Project not found: ${projectId}`);
  }
  if (!project.floorPlanData) {
    throw new Error("Project has no floorPlanData");
  }

  const { doc } = safeUpgradeFloorPlanDoc(project.floorPlanData);
  if (!isFloorPlanDocV3(doc)) {
    throw new Error("Invalid floor plan doc");
  }
  if (doc.walls.length === 0) {
    throw new Error("No walls to convert");
  }

  const { convertFloorPlanTo3D, exportToGLB } = await import(
    "@/lib/floorplan/convert-to-3d"
  );

  const { scene } = convertFloorPlanTo3D(doc);
  const glb = await exportToGLB(scene);
  const modelUrl = await uploadModel(project.userId, projectId, Buffer.from(glb));

  await db
    .update(projects)
    .set({ modelUrl, status: "COMPLETE", updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Best-effort: mark latest conversion job as complete.
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
        .set({
          status: "COMPLETE",
          modelUrl,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversionJobs.id, job.id));
    }
  } catch {
    // ignore
  }

  console.log(JSON.stringify({ ok: true, projectId, modelUrl }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
