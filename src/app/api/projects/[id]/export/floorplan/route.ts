import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();

    const access = await getProjectAccess({ projectId: id, userId });
    if (!access?.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [project] = await db
      .select({
        id: projects.id,
        title: projects.title,
        floorPlanData: projects.floorPlanData,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.floorPlanData) {
      return NextResponse.json({ error: "No floor plan data" }, { status: 404 });
    }

    const filename = `${project.title.replace(/\s+/g, "-").toLowerCase()}-floorplan.json`;
    const json = JSON.stringify(project.floorPlanData, null, 2);

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("/api/projects/[id]/export/floorplan GET failed", err);
    return NextResponse.json({ error: "Failed to export floor plan" }, { status: 500 });
  }
}
