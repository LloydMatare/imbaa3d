import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projectMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; memberId: string }>;
  }
) {
  const { id, memberId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDbUser();
    const access = await getProjectAccess({ projectId: id, userId });
    if (!access || !access.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.id, memberId),
          eq(projectMembers.projectId, id)
        )
      )
      .returning({ id: projectMembers.id });

    if (!result.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("/api/projects/[id]/members/[memberId] DELETE failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
