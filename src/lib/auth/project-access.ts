import { db } from "@/lib/db";
import { projectMembers, projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export type ProjectRole = "viewer" | "editor";

export type ProjectAccess = {
  project: {
    id: string;
    userId: string;
    isPublic: boolean;
    shareToken?: string | null;
  };
  isOwner: boolean;
  role: ProjectRole | null;
  canView: boolean;
  canEdit: boolean;
};

function isMissingRelation(err: unknown) {
  const e = err as { code?: unknown; cause?: unknown };
  const c = e?.cause as { code?: unknown } | undefined;
  const code = (c?.code ?? e?.code) as unknown;
  return code === "42P01"; // undefined_table
}

export async function getProjectAccess(params: {
  projectId: string;
  userId: string | null;
  token?: string | null;
}) {
  const { projectId, userId, token } = params;
  const [project] = await db
    .select({
      id: projects.id,
      userId: projects.userId,
      isPublic: projects.isPublic,
      shareToken: projects.shareToken,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return null;

  let role: ProjectRole | null = null;
  if (userId) {
    try {
      const [member] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId)
          )
        )
        .limit(1);
      role = (member?.role as ProjectRole | undefined) ?? null;
    } catch (err) {
      if (!isMissingRelation(err)) {
        throw err;
      }
      // ProjectMember table missing (migrations not applied). Treat as no role.
      role = null;
    }
  }

  const isOwner = Boolean(userId && project.userId === userId);
  const canView =
    project.isPublic ||
    isOwner ||
    role !== null ||
    Boolean(token && project.shareToken && token === project.shareToken);
  const canEdit = isOwner || role === "editor";

  return { project, isOwner, role, canView, canEdit } satisfies ProjectAccess;
}
