import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, projectVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";

// POST: Restore a version
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: projectId, versionId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch the version
    const [version] = await db
      .select({
        id: projectVersions.id,
        floorPlanData: projectVersions.floorPlanData,
      })
      .from(projectVersions)
      .where(
        and(
          eq(projectVersions.id, versionId),
          eq(projectVersions.projectId, projectId)
        )
      )
      .limit(1);

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Update the project with the version's floor plan data
    await db
      .update(projects)
      .set({
        floorPlanData: version.floorPlanData,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      floorPlanData: version.floorPlanData,
    });
  } catch (err) {
    console.error("/api/projects/[id]/versions/[versionId] POST failed", err);
    return NextResponse.json({ error: "Failed to restore version" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: projectId, versionId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await db
      .delete(projectVersions)
      .where(
        and(
          eq(projectVersions.id, versionId),
          eq(projectVersions.projectId, projectId)
        )
      )
      .returning({ id: projectVersions.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/projects/[id]/versions/[versionId] DELETE failed", err);
    return NextResponse.json({ error: "Failed to delete version" }, { status: 500 });
  }
}
