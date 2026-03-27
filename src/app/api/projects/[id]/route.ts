import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

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

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (err) {
    console.error("/api/projects/[id] GET failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PATCH(
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
    const data = (await req.json()) as Record<string, unknown>;

    // Only allow updating specific fields from the client.
    const allowed: Record<string, boolean> = {
      title: true,
      description: true,
      type: true,
      status: true,
      floorPlanData: true,
      sceneConfig: true,
      thumbnailUrl: true,
      modelUrl: true,
      isPublic: true,
    };

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (allowed[k]) patch[k] = v;
    }

    const [updated] = await db
      .update(projects)
      .set(patch)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("/api/projects/[id] PATCH failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
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

    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning({ id: projects.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("/api/projects/[id] DELETE failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
