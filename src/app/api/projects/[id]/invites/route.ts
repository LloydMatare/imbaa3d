import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projectInvites, projectMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDbUser();
    const access = await getProjectAccess({ projectId: id, userId });
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const invites = await db
      .select({
        id: projectInvites.id,
        email: projectInvites.email,
        role: projectInvites.role,
        status: projectInvites.status,
        createdAt: projectInvites.createdAt,
      })
      .from(projectInvites)
      .where(eq(projectInvites.projectId, id));

    return NextResponse.json({ invites });
  } catch (err) {
    console.error("/api/projects/[id]/invites GET failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { email, role } = body as { email?: string; role?: string };
  if (!email || typeof email !== "string" || !role || !["viewer", "editor"].includes(role)) {
    return NextResponse.json({ error: "Invalid email or role" }, { status: 400 });
  }

  try {
    await ensureDbUser();
    const access = await getProjectAccess({ projectId: id, userId });
    if (!access || !access.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if user already a member
    const existingMember = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, id), eq(users.email, email)))
      .innerJoin(users, eq(projectMembers.userId, users.id));
    if (existingMember.length > 0) {
      return NextResponse.json({ error: "User is already a member" }, { status: 400 });
    }

    // Check if invite already exists
    const existingInvite = await db
      .select()
      .from(projectInvites)
      .where(and(eq(projectInvites.projectId, id), eq(projectInvites.email, email)));
    if (existingInvite.length > 0) {
      return NextResponse.json({ error: "Invite already sent" }, { status: 400 });
    }

    const token = crypto.randomUUID();
    const invite = await db
      .insert(projectInvites)
      .values({
        projectId: id,
        email,
        role,
        token,
        invitedBy: userId,
      })
      .returning({
        id: projectInvites.id,
        email: projectInvites.email,
        role: projectInvites.role,
        token: projectInvites.token,
        createdAt: projectInvites.createdAt,
      });

    // TODO: send email with accept link

    return NextResponse.json({ invite: invite[0] });
  } catch (err) {
    console.error("/api/projects/[id]/invites POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}