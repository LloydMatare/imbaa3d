import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Dev-only: fix or clear modelUrl in DB
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { projectId, clear } = body as { projectId?: string; clear?: boolean };

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  if (clear) {
    await db
      .update(projects)
      .set({ modelUrl: null, status: "DRAFT" })
      .where(eq(projects.id, projectId));
    return NextResponse.json({ success: true, modelUrl: null });
  }

  const newUrl = `/api/models/${projectId}`;
  await db
    .update(projects)
    .set({ modelUrl: newUrl })
    .where(eq(projects.id, projectId));
  return NextResponse.json({ success: true, modelUrl: newUrl });
}
