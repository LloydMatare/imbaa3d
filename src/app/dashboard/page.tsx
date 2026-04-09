import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projectMembers, projects, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Navbar } from "@/components/layout/navbar";
import { ProjectCard } from "@/components/ui/project-card";
import { NewProjectButton } from "@/components/ui/new-project-button";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { formatDbError } from "@/lib/db/format-db-error";
import { assertDbConnection } from "@/lib/db/assert-db";

function isMissingRelation(err: unknown) {
  const e = err as { code?: unknown; cause?: unknown };
  const c = e?.cause as { code?: unknown } | undefined;
  return (c?.code ?? e?.code) === "42P01";
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  try {
    await assertDbConnection();
    await ensureDbUser();
  } catch (err) {
    console.error("Failed to ensure DB user", err);
    const cause = formatDbError(err);
    throw new Error(
      `Database error while initializing your account. ${cause}. Check DATABASE_URL and ensure Postgres is running + migrated.`,
      { cause: err as unknown }
    );
  }

  let userProjects: Array<{
    id: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    thumbnailUrl: string | null;
    updatedAt: Date;
    isPublic: boolean;
    isOwner: boolean;
    accessRole: "owner" | "editor" | "viewer";
  }> = [];
  let credits = 0;
  let totalModels = 0;
  let totalPublic = 0;
  try {
    const [ownedProjects, userRow] = await Promise.all([
      db
        .select({
          id: projects.id,
          title: projects.title,
          description: projects.description,
          type: projects.type,
          status: projects.status,
          thumbnailUrl: projects.thumbnailUrl,
          updatedAt: projects.updatedAt,
          isPublic: projects.isPublic,
        })
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(desc(projects.updatedAt)),
      db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);
    let sharedProjects: typeof userProjects = [];
    try {
      const rows = await db
        .select({
          id: projects.id,
          title: projects.title,
          description: projects.description,
          type: projects.type,
          status: projects.status,
          thumbnailUrl: projects.thumbnailUrl,
          updatedAt: projects.updatedAt,
          isPublic: projects.isPublic,
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
        updatedAt: row.updatedAt,
        isPublic: row.isPublic,
        isOwner: false,
        accessRole: row.accessRole === "editor" ? "editor" : "viewer",
      }));
    } catch (err) {
      if (!isMissingRelation(err)) {
        throw err;
      }
    }

    userProjects = [
      ...ownedProjects.map((project) => ({
        id: project.id,
        title: project.title,
        description: project.description,
        type: project.type,
        status: project.status,
        thumbnailUrl: project.thumbnailUrl,
        updatedAt: project.updatedAt,
        isPublic: project.isPublic,
        isOwner: true,
        accessRole: "owner" as const,
      })),
      ...sharedProjects,
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    credits = userRow[0]?.credits ?? 0;
    totalModels = ownedProjects.filter(p => p.status === "COMPLETE").length;
    totalPublic = ownedProjects.filter(p => p.isPublic).length;
  } catch (err) {
    console.error("Dashboard DB query failed", err);
    const cause = formatDbError(err);
    throw new Error(
      `Database error while loading your dashboard. ${cause}. Check DATABASE_URL and ensure Postgres is running + migrated.`,
      { cause: err as unknown }
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-gray-400 text-sm mt-1">
              {userProjects.length} project{userProjects.length !== 1 && "s"} ·{" "}
              {credits} credits remaining
            </p>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>{totalModels} models generated</span>
              <span>{totalPublic} public projects</span>
            </div>
          </div>
          <NewProjectButton />
        </div>

        {userProjects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-2xl">
            <div className="text-4xl mb-4">🏗️</div>
            <h2 className="text-lg font-medium text-white mb-2">
              No projects yet
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Create your first floor plan or upload a 3D model to get started.
            </p>
            <NewProjectButton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {userProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
