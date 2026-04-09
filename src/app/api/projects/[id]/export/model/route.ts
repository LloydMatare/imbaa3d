import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { downloadModel } from "@/lib/storage";

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

    if (!access.project.modelUrl) {
      return NextResponse.json({ error: "No model available" }, { status: 404 });
    }

    if (!access.project.modelUrl.startsWith("/api/models/")) {
      return NextResponse.redirect(access.project.modelUrl, { status: 302 });
    }

    const modelBuffer = await downloadModel(access.project.userId, id);
    if (!modelBuffer) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const safeTitle = access.project.title.replace(/\s+/g, "-").toLowerCase();
    const filename = safeTitle ? `${safeTitle}.glb` : `${id}.glb`;
    return new NextResponse(new Uint8Array(modelBuffer), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": modelBuffer.length.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("/api/projects/[id]/export/model GET failed", err);
    return NextResponse.json({ error: "Failed to export model" }, { status: 500 });
  }
}
