import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projectInvites, projectMembers, users } from "@/lib/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess, type ProjectRole } from "@/lib/auth/project-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDbUser();
    const access = await getProjectAccess({ projectId: id, userId });
    if (!access || !access.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [owner] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(eq(users.id, access.project.userId))
      .limit(1);

    const members = await db
      .select({
        id: projectMembers.id,
        userId: projectMembers.userId,
        role: projectMembers.role,
        createdAt: projectMembers.createdAt,
        email: users.email,
        name: users.name,
        image: users.image,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, id));

    const invites = await db
      .select({
        id: projectInvites.id,
        email: projectInvites.email,
        role: projectInvites.role,
        status: projectInvites.status,
        token: projectInvites.token,
        createdAt: projectInvites.createdAt,
      })
      .from(projectInvites)
      .where(eq(projectInvites.projectId, id));

    return NextResponse.json({
      owner,
      members,
      invites,
    });
  } catch (err) {
    console.error("/api/projects/[id]/members GET failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDbUser();
    const access = await getProjectAccess({ projectId: id, userId });
    if (!access || !access.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { email?: string; role?: ProjectRole };
    const email = body.email?.trim().toLowerCase();
    const role: ProjectRole = body.role === "editor" ? "editor" : "viewer";
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(ilike(users.email, email))
      .limit(1);

    if (user && user.id === access.project.userId) {
      return NextResponse.json({ error: "Owner already has access" }, { status: 400 });
    }

    if (user) {
      const [existing] = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, id),
            eq(projectMembers.userId, user.id)
          )
        )
        .limit(1);

      if (!existing) {
        await db
          .insert(projectMembers)
          .values({ projectId: id, userId: user.id, role })
          .onConflictDoNothing({
            target: [projectMembers.projectId, projectMembers.userId],
          });
      }

      return NextResponse.json({ invited: "member" });
    }

    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    await db
      .insert(projectInvites)
      .values({
        projectId: id,
        email,
        role,
        token,
        invitedBy: userId,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [projectInvites.projectId, projectInvites.email],
        set: {
          role,
          token,
          status: "pending",
          updatedAt: new Date(),
        },
      });

    const origin = new URL(req.url).origin;
    const inviteUrl = `${origin}/invites/${encodeURIComponent(token)}`;

    return NextResponse.json({ invited: "email", inviteUrl, token });
  } catch (err) {
    console.error("/api/projects/[id]/members POST failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
