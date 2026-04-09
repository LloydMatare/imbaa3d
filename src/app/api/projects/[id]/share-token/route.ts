import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

function createShareToken() {
  // URL-safe token. 24 bytes => 32 chars base64url-ish, plenty of entropy for "unlisted" links.
  return randomBytes(24).toString("base64url");
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

  const body = (await req.json().catch(() => ({}))) as { regenerate?: boolean };
  const regenerate = body?.regenerate === true;

  try {
    await ensureDbUser();

    const [project] = await db
      .select({ shareToken: projects.shareToken })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (project.shareToken && !regenerate) {
      return NextResponse.json({ shareToken: project.shareToken });
    }

    // Retry a few times in the extremely unlikely event of a unique collision.
    for (let i = 0; i < 5; i++) {
      const token = createShareToken();
      try {
        const [updated] = await db
          .update(projects)
          .set({ shareToken: token })
          .where(and(eq(projects.id, id), eq(projects.userId, userId)))
          .returning({ shareToken: projects.shareToken });

        if (updated?.shareToken) {
          return NextResponse.json({ shareToken: updated.shareToken });
        }
      } catch (err) {
        // Most likely a UNIQUE violation. Keep the retry loop small and fail loudly otherwise.
        if (i === 4) throw err;
      }
    }

    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  } catch (err) {
    console.error("/api/projects/[id]/share-token POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

