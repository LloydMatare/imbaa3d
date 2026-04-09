import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";
import { getProjectAccess } from "@/lib/auth/project-access";
import { SafeModelViewer } from "./safe-model-viewer";
import { GenerateModelButton } from "./generate-model-button";
import { EmbedCustomizer } from "./embed-customizer";
import { ConversionStatusPill } from "@/components/ui/conversion-status-pill";
import { CopyShareLinkButton } from "./copy-share-link-button";
import { CollaboratorsPanel } from "./collaborators-panel";
import type { FloorPlanDocV3 } from "@/lib/floorplan/types";

export default async function ViewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { projectId } = await params;
  const { token } = await searchParams;
  const { userId } = await auth();

  // If the user is signed in, ensure the user row exists (keeps behavior consistent with dashboard/editor).
  if (userId) {
    await ensureDbUser();
  }

  const access = await getProjectAccess({ projectId, userId, token });
  let project = null as
    | {
        id: string;
        title: string;
        status: string;
        modelUrl: string | null;
        floorPlanData: unknown;
        sceneConfig: unknown;
        isPublic: boolean;
        userId: string;
        updatedAt: Date | null;
      }
    | null;

  if (access?.canView) {
    const [p] = await db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        modelUrl: projects.modelUrl,
        floorPlanData: projects.floorPlanData,
        sceneConfig: projects.sceneConfig,
        isPublic: projects.isPublic,
        userId: projects.userId,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    project = p ?? null;
  }

  if (!project) {
    if (!userId) {
      if (token) {
        // Never redirect on a potentially invalid token, just 404.
        notFound();
      }
      // Distinguish "missing" vs "private" when signed out.
      const [exists] = await db
        .select({ isPublic: projects.isPublic })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!exists) notFound();
      if (!exists.isPublic) redirect("/sign-in");
      notFound();
    }
    notFound();
  }

  const isOwner = userId === project.userId;
  const canEdit = isOwner || access?.role === "editor";
  const modelUrlBase = project.modelUrl;
  const version =
    project.updatedAt instanceof Date ? String(project.updatedAt.getTime()) : "";
  const modelUrl =
    modelUrlBase && modelUrlBase.startsWith("/api/models/")
      ? `${modelUrlBase}${modelUrlBase.includes("?") ? "&" : "?"}${
          token ? `token=${encodeURIComponent(token)}&` : ""
        }v=${encodeURIComponent(version)}`
      : modelUrlBase;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="h-12 border-b border-gray-800 flex items-center px-4 gap-4">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition">
          ← Back
        </Link>
        <div className="h-4 w-px bg-gray-800" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{project.title}</div>
          <div className="text-[11px] text-gray-500">
            {project.status}
            {project.isPublic ? " • Public" : ""}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {project.modelUrl ? (
            <EmbedCustomizer
              projectId={project.id}
              isPublic={project.isPublic}
              isOwner={Boolean(isOwner)}
              token={token}
            />
          ) : null}
          <CopyShareLinkButton
            projectId={project.id}
            isPublic={project.isPublic}
            isOwner={Boolean(isOwner)}
            token={token}
          />
          {isOwner && <CollaboratorsPanel projectId={project.id} />}
          {(Boolean(project.modelUrl) || (isOwner && Boolean(project.floorPlanData))) && (
            <details className="relative group">
              <summary className="list-none px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition cursor-pointer">
                Downloads
              </summary>
              <div className="absolute right-0 mt-1 w-44 rounded-lg border border-gray-800 bg-gray-950 shadow-xl z-50 overflow-hidden hidden group-open:block">
                {project.modelUrl && (
                  <>
                    <a
                      href={
                        token
                          ? `/api/projects/${project.id}/export/model?token=${encodeURIComponent(
                              token
                            )}`
                          : `/api/projects/${project.id}/export/model`
                      }
                      className="block px-3 py-2 text-[11px] text-gray-200 hover:bg-gray-800 transition"
                    >
                      Download .glb
                    </a>
                    <a
                      href={
                        token
                          ? `/api/projects/${project.id}/export/model-obj?token=${encodeURIComponent(
                              token
                            )}`
                          : `/api/projects/${project.id}/export/model-obj`
                      }
                      className="block px-3 py-2 text-[11px] text-gray-200 hover:bg-gray-800 transition"
                    >
                      Download .obj
                    </a>
                    <a
                      href={
                        token
                          ? `/api/projects/${project.id}/export/model-stl?token=${encodeURIComponent(
                              token
                            )}`
                          : `/api/projects/${project.id}/export/model-stl`
                      }
                      className="block px-3 py-2 text-[11px] text-gray-200 hover:bg-gray-800 transition"
                    >
                      Download .stl
                    </a>
                  </>
                )}
                {isOwner && Boolean(project.floorPlanData) && (
                  <a
                    href={`/api/projects/${project.id}/export/floorplan`}
                    className="block px-3 py-2 text-[11px] text-gray-200 hover:bg-gray-800 transition"
                  >
                    Download JSON
                  </a>
                )}
              </div>
            </details>
          )}
        </div>
        {isOwner && (
          <Link
            href={`/editor/${project.id}`}
            className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          >
            Edit
          </Link>
        )}
      </header>

      <main className="flex-1">
        {!project.modelUrl ? (
          <div className="max-w-xl mx-auto px-4 py-20 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white">No 3D model yet</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
              {isOwner
                ? "Generate a 3D model from your floor plan, or go to the editor to design one first."
                : "This project has not been converted to 3D yet. Check back later."}
            </p>
            {isOwner && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <GenerateModelButton projectId={project.id} />
                <ConversionStatusPill projectId={project.id} />
                <Link
                  href={`/editor/${project.id}`}
                  className="px-4 py-2 rounded-lg text-sm border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                >
                  Open Editor
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[calc(100vh-3rem)]">
            <SafeModelViewer
              url={modelUrl!}
              projectId={project.id}
              floorPlanData={project.floorPlanData as FloorPlanDocV3 | null}
              sceneConfig={project.sceneConfig}
              canSaveThumbnail={Boolean(isOwner)}
              canExportImage={Boolean(isOwner)}
              canEditStaging={Boolean(canEdit)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { projectId } = await params;
  const { token } = await searchParams;

  const [project] = await db
    .select({
      title: projects.title,
      description: projects.description,
      thumbnailUrl: projects.thumbnailUrl,
      isPublic: projects.isPublic,
      shareToken: projects.shareToken,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const title = project?.title ? `${project.title} — Imbaa3D` : "Imbaa3D Viewer";
  const description = project?.description || "Interactive 3D floor plan viewer";
  const canExposeThumbnail =
    project?.isPublic === true ||
    Boolean(token && project?.shareToken && token === project.shareToken);
  const thumbnailUrl = (() => {
    if (!canExposeThumbnail) return undefined;
    if (!project?.thumbnailUrl) return undefined;
    if (!project.thumbnailUrl.startsWith("/api/projects/")) return project.thumbnailUrl;
    return `${project.thumbnailUrl}${project.thumbnailUrl.includes("?") ? "&" : "?"}${
      token && project?.shareToken && token === project.shareToken
        ? `token=${encodeURIComponent(token)}&`
        : ""
    }v=${encodeURIComponent(
      project?.updatedAt instanceof Date ? project.updatedAt.getTime() : Date.now()
    )}`;
  })();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const canonical = baseUrl ? `${baseUrl}/view/${projectId}` : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(canonical ? { url: canonical } : {}),
      images: thumbnailUrl ? [thumbnailUrl] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: thumbnailUrl ? [thumbnailUrl] : [],
    },
    ...(canonical ? { alternates: { canonical } } : {}),
  };
}
