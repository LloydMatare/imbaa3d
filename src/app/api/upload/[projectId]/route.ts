import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { storage } from "@/lib/storage";
import { getProjectAccess } from "@/lib/auth/project-access";

export const runtime = "nodejs";

function parseDataUrl(dataUrl: string): { contentType: string; base64: string } | null {
  // Expect: data:<mime>;base64,<payload>
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1]!.trim();
  const base64 = m[2]!.trim();
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") return null;
  if (!base64) return null;
  return { contentType, base64 };
}

// POST: Upload a reference floor plan image
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

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { imageData, fileName } = body as {
      imageData?: string;
      fileName?: string;
    };

    if (!imageData || typeof imageData !== "string") {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    const parsed = parseDataUrl(imageData);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid image or PDF format" },
        { status: 400 }
      );
    }

    const imageKey = `ref-${projectId}`;
    const metaKey = `ref-${projectId}-meta`;

    await storage.upload(imageKey, parsed.base64);
    await storage.upload(
      metaKey,
      Buffer.from(
        JSON.stringify({
          contentType: parsed.contentType,
          fileName: fileName || "uploaded-plan",
          uploadedAt: new Date().toISOString(),
        })
      ).toString("base64")
    );

    return NextResponse.json({
      success: true,
      imageUrl: `/api/upload/${projectId}`,
      fileName: fileName || "uploaded-plan",
      contentType: parsed.contentType,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("/api/upload POST failed", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}

// GET: Serve an uploaded reference image
export async function GET(
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

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const imageKey = `ref-${projectId}`;
    const metaKey = `ref-${projectId}-meta`;

    if (req.nextUrl.searchParams.get("meta") === "1") {
      const metaBuf = await storage.download(metaKey);
      if (!metaBuf) {
        return NextResponse.json({ error: "Metadata not found" }, { status: 404 });
      }
      const meta = JSON.parse(metaBuf.toString("utf8")) as {
        contentType?: string;
        fileName?: string;
        uploadedAt?: string;
      };
      return NextResponse.json({
        exists: true,
        contentType: meta?.contentType ?? "application/octet-stream",
        fileName: meta?.fileName ?? "uploaded-plan",
        uploadedAt: meta?.uploadedAt ?? null,
      });
    }

    const data = await storage.download(imageKey);

    if (!data) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    let contentType = "application/octet-stream";
    try {
      const metaBuf = await storage.download(metaKey);
      if (metaBuf) {
        const meta = JSON.parse(metaBuf.toString("utf8")) as { contentType?: string };
        if (meta?.contentType && typeof meta.contentType === "string") {
          contentType = meta.contentType;
        }
      }
    } catch {
      // Ignore metadata parse issues and serve the bytes anyway.
    }

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("/api/upload GET failed", err);
    return NextResponse.json(
      { error: "Failed to serve image" },
      { status: 500 }
    );
  }
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    await ensureDbUser();

    const access = await getProjectAccess({ projectId, userId });
    if (!access || !access.canView) {
      return new NextResponse(null, { status: 404 });
    }

    const imageKey = `ref-${projectId}`;
    const metaKey = `ref-${projectId}-meta`;
    const data = await storage.download(imageKey);
    if (!data) return new NextResponse(null, { status: 404 });

    let contentType = "application/octet-stream";
    try {
      const metaBuf = await storage.download(metaKey);
      if (metaBuf) {
        const meta = JSON.parse(metaBuf.toString("utf8")) as { contentType?: string };
        if (meta?.contentType && typeof meta.contentType === "string") {
          contentType = meta.contentType;
        }
      }
    } catch {
      // ignore
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("/api/upload HEAD failed", err);
    return new NextResponse(null, { status: 500 });
  }
}
