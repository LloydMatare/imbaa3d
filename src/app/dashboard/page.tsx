import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { ProjectCard } from "@/components/ui/project-card";
import { NewProjectButton } from "@/components/ui/new-project-button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  const credits = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My Projects</h1>
            <p className="text-gray-400 text-sm mt-1">
              {projects.length} project{projects.length !== 1 && "s"} ·{" "}
              {credits?.credits ?? 0} credits remaining
            </p>
          </div>
          <NewProjectButton />
        </div>

        {projects.length === 0 ? (
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
            {projects.map((project: { id: string; title: string; description: string | null; type: string; status: string; thumbnailUrl: string | null; isPublic: boolean; createdAt: Date; updatedAt: Date }) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
