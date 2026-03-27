import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();
    const userProjects = await db
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

    return NextResponse.json(userProjects);
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
        userId,
      })
      .returning();

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("/api/projects POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
