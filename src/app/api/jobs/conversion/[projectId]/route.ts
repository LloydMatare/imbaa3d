import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { conversionJobs, projects } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(20, Number(limitParam || 5)));

  try {
    await ensureDbUser();

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const jobs = await db
      .select({
        id: conversionJobs.id,
        status: conversionJobs.status,
        mode: conversionJobs.mode,
        modelUrl: conversionJobs.modelUrl,
        error: conversionJobs.error,
        createdAt: conversionJobs.createdAt,
        startedAt: conversionJobs.startedAt,
        finishedAt: conversionJobs.finishedAt,
      })
      .from(conversionJobs)
      .where(eq(conversionJobs.projectId, projectId))
      .orderBy(desc(conversionJobs.createdAt))
      .limit(limit);

    return NextResponse.json({ jobs });
  } catch (err) {
    console.error("/api/jobs/conversion GET failed", err);
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 });
  }
}

