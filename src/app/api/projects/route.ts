import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projectMembers, projects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { createEmptyFloorPlanDoc } from "@/lib/floorplan/types";

function isMissingRelation(err: unknown) {
  const e = err as { code?: unknown; cause?: unknown };
  const c = e?.cause as { code?: unknown } | undefined;
  return (c?.code ?? e?.code) === "42P01";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();
    const ownedProjects = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        type: projects.type,
        status: projects.status,
        thumbnailUrl: projects.thumbnailUrl,
        isPublic: projects.isPublic,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));

    let sharedProjects: Array<{
      id: string;
      title: string;
      description: string | null;
      type: string;
      status: string;
      thumbnailUrl: string | null;
      isPublic: boolean;
      createdAt: Date;
      updatedAt: Date;
      isOwner: boolean;
      accessRole: "editor" | "viewer";
    }> = [];

    try {
      const rows = await db
        .select({
          id: projects.id,
          title: projects.title,
          description: projects.description,
          type: projects.type,
          status: projects.status,
          thumbnailUrl: projects.thumbnailUrl,
          isPublic: projects.isPublic,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          accessRole: projectMembers.role,
        })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .where(eq(projectMembers.userId, userId))
        .orderBy(desc(projects.updatedAt));

      sharedProjects = rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        thumbnailUrl: row.thumbnailUrl,
        isPublic: row.isPublic,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isOwner: false,
        accessRole: row.accessRole === "editor" ? "editor" : "viewer",
      }));
    } catch (err) {
      if (!isMissingRelation(err)) {
        throw err;
      }
    }

    return NextResponse.json(
      [
        ...ownedProjects.map((project) => ({
          ...project,
          isOwner: true,
          accessRole: "owner" as const,
        })),
        ...sharedProjects,
      ].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    );
  } catch (err) {
    console.error("/api/projects GET failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();

    const { title, description, type } = await req.json();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const [project] = await db
      .insert(projects)
      .values({
        title,
        description: description || null,
        type: type || "FULL_CONVERSION",
        floorPlanData: createEmptyFloorPlanDoc(),
        userId,
      })
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

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("/api/projects POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
