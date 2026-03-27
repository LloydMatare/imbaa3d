import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Navbar } from "@/components/layout/navbar";
import { ProjectCard } from "@/components/ui/project-card";
import { NewProjectButton } from "@/components/ui/new-project-button";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { formatDbError } from "@/lib/db/format-db-error";
import { assertDbConnection } from "@/lib/db/assert-db";

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

  let userProjects: typeof projects.$inferSelect[] = [];
  let credits = 0;
  try {
    const [p, userRow] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(desc(projects.updatedAt)),
      db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);
    userProjects = p;
    credits = userRow[0]?.credits ?? 0;
  } catch (err) {
    console.error("Dashboard DB query failed", err);
    throw new Error(
      "Database error while loading your dashboard. Check DATABASE_URL and ensure Postgres is running + migrated.",
      { cause: err as unknown }
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My Projects</h1>
            <p className="text-gray-400 text-sm mt-1">
              {userProjects.length} project{userProjects.length !== 1 && "s"} ·{" "}
              {credits} credits remaining
            </p>
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
