import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, projectVersions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";

// GET: List versions for a project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
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

    const versions = await db
      .select({
        id: projectVersions.id,
        label: projectVersions.label,
        createdAt: projectVersions.createdAt,
      })
      .from(projectVersions)
      .where(eq(projectVersions.projectId, projectId))
      .orderBy(desc(projectVersions.createdAt))
      .limit(50);

    return NextResponse.json({ versions });
  } catch (err) {
    console.error("/api/projects/[id]/versions GET failed", err);
    return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
  }
}

// POST: Create a new version snapshot
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
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

    const [project] = await db
      .select({ id: projects.id, floorPlanData: projects.floorPlanData })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const label = (body as { label?: string }).label ?? null;

    const [version] = await db
      .insert(projectVersions)
      .values({
        projectId,
        floorPlanData: project.floorPlanData ?? {},
        label,
      })
      .returning({ id: projectVersions.id, createdAt: projectVersions.createdAt });

    return NextResponse.json({ success: true, version });
  } catch (err) {
    console.error("/api/projects/[id]/versions POST failed", err);
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
  }
}
