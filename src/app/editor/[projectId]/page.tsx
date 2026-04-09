import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EditorShell } from "./editor-shell";
import { getProjectAccess } from "@/lib/auth/project-access";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const access = await getProjectAccess({ projectId, userId });
  if (!access || !access.canEdit) notFound();

  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      type: projects.type,
      status: projects.status,
      modelUrl: projects.modelUrl,
      floorPlanData: projects.floorPlanData,
      isPublic: projects.isPublic,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) notFound();

  return <EditorShell project={project} isOwner={access.isOwner} />;
}
