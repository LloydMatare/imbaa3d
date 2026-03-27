import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { EditorShell } from "./editor-shell";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) notFound();

  return <EditorShell project={project} />;
}
