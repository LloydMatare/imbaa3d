import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { safeUpgradeFloorPlanDoc, isFloorPlanDocV3 } from "@/lib/floorplan/types";
import { convertFloorPlanTo3D, exportToSTL } from "@/lib/floorplan/convert-to-3d";

export const runtime = "nodejs";

function isMissingColumn(err: unknown, column: string) {
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  const c = e?.cause as { code?: unknown; message?: unknown } | undefined;
  const msg = String((c?.message ?? e?.message) ?? "");
  const code = (c?.code ?? e?.code) as unknown;
  return code === "42703" && msg.toLowerCase().includes(`"${column.toLowerCase()}"`);
}

async function getAccessProject(projectId: string, userId: string | null, token: string | null) {
  let project:
    | {
        id: string;
        title: string;
        userId: string;
        modelUrl: string | null;
        floorPlanData: unknown;
        isPublic: boolean;
        shareToken?: string | null;
      }
    | undefined;

  try {
    const [p] = await db
      .select({
        id: projects.id,
        title: projects.title,
        userId: projects.userId,
        modelUrl: projects.modelUrl,
        floorPlanData: projects.floorPlanData,
        isPublic: projects.isPublic,
        shareToken: projects.shareToken,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    project = p;
  } catch (err) {
    if (!isMissingColumn(err, "shareToken")) throw err;
    const [p] = await db
      .select({
        id: projects.id,
        title: projects.title,
        userId: projects.userId,
        modelUrl: projects.modelUrl,
        floorPlanData: projects.floorPlanData,
        isPublic: projects.isPublic,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    project = p ? { ...p, shareToken: null } : undefined;
  }

  if (!project) return { ok: false as const, status: 404 as const, project: null };

  const allowed =
    (userId && project.userId === userId) ||
    project.isPublic ||
    (token && project.shareToken && token === project.shareToken);

  if (!allowed) return { ok: false as const, status: 401 as const, project: null };
  return { ok: true as const, status: 200 as const, project };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  const token = req.nextUrl.searchParams.get("token");

  try {
    if (userId) {
      await ensureDbUser();
    }

    const access = await getAccessProject(id, userId ?? null, token);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Project not found" : "Unauthorized" },
        { status: access.status }
      );
    }

    if (!access.project.floorPlanData) {
      return NextResponse.json({ error: "No floor plan data available" }, { status: 404 });
    }

    const { doc } = safeUpgradeFloorPlanDoc(access.project.floorPlanData);
    if (!isFloorPlanDocV3(doc)) {
      return NextResponse.json({ error: "Invalid floor plan data" }, { status: 400 });
    }
    if (doc.walls.length === 0) {
      return NextResponse.json({ error: "No walls to export" }, { status: 400 });
    }

    const { scene } = convertFloorPlanTo3D(doc);
    const stlBuffer = await exportToSTL(scene);

    const safeTitle = access.project.title.replace(/\s+/g, "-").toLowerCase();
    const filename = safeTitle ? `${safeTitle}.stl` : `${id}.stl`;
    return new NextResponse(new Uint8Array(stlBuffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": stlBuffer.byteLength.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("/api/projects/[id]/export/model-stl GET failed", err);
    return NextResponse.json({ error: "Failed to export STL model" }, { status: 500 });
  }
}