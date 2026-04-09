import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { uploadModel, downloadModel, deleteModel } from "@/lib/storage";

export const runtime = "nodejs";

function isMissingColumn(err: unknown, column: string) {
  // drizzle/postgres driver wraps errors; Next logs show `err.cause` is a PostgresError with code 42703.
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  const c = e?.cause as { code?: unknown; message?: unknown } | undefined;
  const msg = String((c?.message ?? e?.message) ?? "");
  const code = (c?.code ?? e?.code) as unknown;
  return code === "42703" && msg.toLowerCase().includes(`"${column.toLowerCase()}"`);
}

async function getAccessProject(
  projectId: string,
  userId: string | null,
  token: string | null
) {
  let project:
    | { id: string; userId: string; isPublic: boolean; shareToken?: string | null }
    | undefined;

  try {
    const [p] = await db
      .select({
        id: projects.id,
        userId: projects.userId,
        isPublic: projects.isPublic,
        shareToken: projects.shareToken,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    project = p;
  } catch (err) {
    // Dev DB drift: some local DBs may not be migrated yet (missing `shareToken`).
    // Fallback to a minimal select so viewers work for owners/public projects.
    if (!isMissingColumn(err, "shareToken")) throw err;
    const [p] = await db
      .select({
        id: projects.id,
        userId: projects.userId,
        isPublic: projects.isPublic,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    project = p ? { ...p, shareToken: null } : undefined;
  }

  if (!project) return { ok: false as const, status: 404 as const, project: null };

  const allowed =
    project.isPublic ||
    (userId && project.userId === userId) ||
    (token && project.shareToken && token === project.shareToken);

  if (!allowed) return { ok: false as const, status: 401 as const, project: null };

  return { ok: true as const, status: 200 as const, project };
}

// POST: Save a model for a project
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();

    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get the model data (base64 encoded GLB)
    const body = await req.json();
    const { modelData } = body as { modelData?: string };

    if (!modelData || typeof modelData !== "string") {
      return NextResponse.json(
        { error: "Model data is required" },
        { status: 400 }
      );
    }

    // Upload the model
    const modelUrl = await uploadModel(userId, projectId, modelData);

    // Update the project with the model URL and status
    await db
      .update(projects)
      .set({
        modelUrl,
        status: "COMPLETE",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      modelUrl,
    });
  } catch (err) {
    console.error("/api/models POST failed", err);
    return NextResponse.json(
      { error: "Failed to save model" },
      { status: 500 }
    );
  }
}

// GET: Serve a model
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  const token = req.nextUrl.searchParams.get("token");

  try {
    const access = await getAccessProject(projectId, userId ?? null, token);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Project not found" : "Unauthorized" },
        { status: access.status }
      );
    }

    const modelBuffer = await downloadModel(access.project.userId, projectId);

    if (!modelBuffer) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(modelBuffer), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": modelBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("/api/models GET failed", err);
    return NextResponse.json(
      { error: "Failed to serve model" },
      { status: 500 }
    );
  }
}

// HEAD: Existence/access check for SafeModelViewer (and to avoid downloading the body)
export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  const token = req.nextUrl.searchParams.get("token");

  try {
    const access = await getAccessProject(projectId, userId ?? null, token);
    if (!access.ok) {
      return new NextResponse(null, { status: access.status });
    }

    const modelBuffer = await downloadModel(access.project.userId, projectId);
    if (!modelBuffer) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": modelBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("/api/models HEAD failed", err);
    return new NextResponse(null, { status: 500 });
  }
}

// DELETE: Delete a model
export async function DELETE(
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

    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Best-effort delete from storage first (DB update still happens).
    try {
      await deleteModel(userId, projectId);
    } catch (e) {
      console.error("Failed to delete model from storage", e);
    }

    // Update the project to remove model URL
    await db
      .update(projects)
      .set({
        modelUrl: null,
        status: "DRAFT",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("/api/models DELETE failed", err);
    return NextResponse.json(
      { error: "Failed to delete model" },
      { status: 500 }
    );
  }
}
