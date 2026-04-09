import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projectInvites, projectMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import type { ProjectRole } from "@/lib/auth/project-access";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDbUser();
    const user = await currentUser();
    const emails = (user?.emailAddresses ?? [])
      .map((e) => e.emailAddress?.toLowerCase())
      .filter(Boolean) as string[];

    const [invite] = await db
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

    if (!invite || invite.status !== "pending") {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (!emails.includes(invite.email.toLowerCase())) {
      return NextResponse.json({ error: "Invite email does not match" }, { status: 403 });
    }

    await db
      .insert(projectMembers)
      .values({
        projectId: invite.projectId,
        userId,
        role: (invite.role as ProjectRole) ?? "viewer",
      })
      .onConflictDoNothing({
        target: [projectMembers.projectId, projectMembers.userId],
      });

    await db
      .update(projectInvites)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(projectInvites.id, invite.id));

    return NextResponse.json({ accepted: true, projectId: invite.projectId });
  } catch (err) {
    console.error("/api/invites/[token]/accept POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
