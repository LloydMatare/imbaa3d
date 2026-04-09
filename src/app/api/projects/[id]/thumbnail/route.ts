import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

type ThumbnailPayload = {
  imageData?: string;
};

function parseDataUrl(dataUrl: string): { contentType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1]!.trim();
  const base64 = m[2]!.trim();
  if (!contentType.startsWith("image/")) return null;
  if (!base64) return null;
  return { contentType, base64 };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();
    const body = (await req.json().catch(() => null)) as ThumbnailPayload | null;
    if (!body?.imageData) {
      return NextResponse.json({ error: "imageData is required" }, { status: 400 });
    }

    const parsed = parseDataUrl(body.imageData);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
    }

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const key = `thumb-${id}`;
    const metaKey = `thumb-${id}-meta`;

    await storage.upload(key, parsed.base64);
    await storage.upload(
      metaKey,
      Buffer.from(
        JSON.stringify({
          contentType: parsed.contentType,
          uploadedAt: new Date().toISOString(),
        })
      ).toString("base64")
    );

    const url = `/api/projects/${id}/thumbnail`;
    await db
      .update(projects)
      .set({ thumbnailUrl: url, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));

    return NextResponse.json({ success: true, thumbnailUrl: url });
  } catch (err) {
    console.error("/api/projects/[id]/thumbnail POST failed", err);
    return NextResponse.json({ error: "Failed to save thumbnail" }, { status: 500 });
  }
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

    const access = await getProjectAccess({ projectId: id, userId, token });
    if (!access?.canView) {
      return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    const [project] = await db
      .select({ id: projects.id, thumbnailUrl: projects.thumbnailUrl })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project?.thumbnailUrl) {
      return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    if (!project.thumbnailUrl.startsWith("/api/projects/")) {
      return NextResponse.redirect(project.thumbnailUrl, { status: 302 });
    }

    const key = `thumb-${id}`;
    const metaKey = `thumb-${id}-meta`;
    const data = await storage.download(key);
    if (!data) {
      return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
    }

    let contentType = "image/png";
    try {
      const metaBuf = await storage.download(metaKey);
      if (metaBuf) {
        const meta = JSON.parse(metaBuf.toString("utf8")) as { contentType?: string };
        if (meta?.contentType) contentType = meta.contentType;
      }
    } catch {
      // ignore
    }

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("/api/projects/[id]/thumbnail GET failed", err);
    return NextResponse.json({ error: "Failed to load thumbnail" }, { status: 500 });
  }
}

export async function HEAD(
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

    const access = await getProjectAccess({ projectId: id, userId, token });
    if (!access?.canView) {
      return new NextResponse(null, { status: 404 });
    }

    const [project] = await db
      .select({ id: projects.id, thumbnailUrl: projects.thumbnailUrl })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project?.thumbnailUrl) {
      return new NextResponse(null, { status: 404 });
    }

    if (!project.thumbnailUrl.startsWith("/api/projects/")) {
      return new NextResponse(null, { status: 302, headers: { Location: project.thumbnailUrl } });
    }

    const key = `thumb-${id}`;
    const data = await storage.download(key);
    if (!data) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Length": data.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("/api/projects/[id]/thumbnail HEAD failed", err);
    return new NextResponse(null, { status: 500 });
  }
}
