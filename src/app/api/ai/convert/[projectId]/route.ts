import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { callAiConvert } from "@/lib/ai/client";
import { loadReferenceImageDataUrl } from "@/lib/ai/reference-image";

export const runtime = "nodejs";

type Mode = "floorplan" | "image";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aiUrl = process.env.AI_SERVICE_URL;
  if (!aiUrl) {
    return NextResponse.json(
      { error: "AI service is not configured (set AI_SERVICE_URL)" },
      { status: 501 }
    );
  }

  const body = (await req.json().catch(() => null)) as { mode?: Mode } | null;
  const mode: Mode = body?.mode === "image" ? "image" : "floorplan";

  try {
    await ensureDbUser();

    const [project] = await db
      .select({
        id: projects.id,
        userId: projects.userId,
        floorPlanData: projects.floorPlanData,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const payload: Record<string, unknown> = {};
    if (mode === "floorplan") {
      if (!project.floorPlanData) {
        return NextResponse.json(
          { error: "Project has no floor plan data" },
          { status: 400 }
        );
      }
      payload.floorPlan = project.floorPlanData;
    } else {
      const dataUrl = await loadReferenceImageDataUrl(projectId);
      if (!dataUrl) {
        return NextResponse.json(
          { error: "No reference image uploaded" },
          { status: 400 }
        );
      }
      payload.imageDataUrl = dataUrl;
    }

    try {
      const result = await callAiConvert(payload);
      return NextResponse.json({ ok: true, mode, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI service error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch (err) {
    console.error("/api/ai/convert POST failed", err);
    return NextResponse.json({ error: "AI conversion failed" }, { status: 500 });
  }
}
