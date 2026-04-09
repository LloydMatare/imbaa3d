import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projectInvites, projectMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { token } = body as { token?: string };
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  try {
    await ensureDbUser();
    const invite = await db
      .select({
        id: projectInvites.id,
        projectId: projectInvites.projectId,
        email: projectInvites.email,
        role: projectInvites.role,
        status: projectInvites.status,
      })
      .from(projectInvites)
      .where(eq(projectInvites.token, token))
      .limit(1);

    if (!invite.length) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const inv = invite[0];
    if (inv.status !== "pending") {
      return NextResponse.json({ error: "Invite already processed" }, { status: 400 });
    }

    // Get user email
    const user = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length || user[0].email !== inv.email) {
      return NextResponse.json({ error: "Token does not match your email" }, { status: 403 });
    }

    // Check if already member
    const existing = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, inv.projectId), eq(projectMembers.userId, userId)));
    if (existing.length > 0) {
      return NextResponse.json({ error: "Already a member" }, { status: 400 });
    }

    // Add member
    await db.insert(projectMembers).values({
      projectId: inv.projectId,
      userId,
      role: inv.role,
    });

    // Update invite status
    await db
      .update(projectInvites)
      .set({ status: "accepted" })
      .where(eq(projectInvites.id, inv.id));

    return NextResponse.json({ accepted: true, projectId: inv.projectId });
  } catch (err) {
    console.error("/api/invites/accept POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}