import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { sanitizeFloorPlanDocForStorage } from "@/lib/floorplan/types";
import { getProjectAccess } from "@/lib/auth/project-access";

const MAX_FLOORPLAN_JSON_BYTES = 900_000; // keep well under common request/proxy limits

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
    if (!access || !access.canView) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [project] = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        type: projects.type,
        status: projects.status,
        floorPlanData: projects.floorPlanData,
        sceneConfig: projects.sceneConfig,
        thumbnailUrl: projects.thumbnailUrl,
        modelUrl: projects.modelUrl,
        isPublic: projects.isPublic,
        userId: projects.userId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.id, id))
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

    if ("floorPlanData" in patch) {
      // Normalize/migrate/sanitize untrusted client payload before storing it.
      const sanitized = sanitizeFloorPlanDocForStorage(patch.floorPlanData);
      const json = JSON.stringify(sanitized);
      if (json.length > MAX_FLOORPLAN_JSON_BYTES) {
        return NextResponse.json(
          { error: "Floor plan is too large" },
          { status: 413 }
        );
      }
      patch.floorPlanData = sanitized;
    }

    const access = await getProjectAccess({ projectId: id, userId });
    if (!access || !access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [updated] = await db
      .update(projects)
      .set(patch)
      .where(eq(projects.id, id))
      .returning({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        type: projects.type,
        status: projects.status,
        floorPlanData: projects.floorPlanData,
        sceneConfig: projects.sceneConfig,
        thumbnailUrl: projects.thumbnailUrl,
        modelUrl: projects.modelUrl,
        isPublic: projects.isPublic,
        userId: projects.userId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      });

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

    const access = await getProjectAccess({ projectId: id, userId });
    if (!access || !access.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await db
      .delete(projects)
      .where(eq(projects.id, id))
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
