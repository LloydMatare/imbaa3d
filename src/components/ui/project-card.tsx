"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  thumbnailUrl: string | null;
  updatedAt: Date;
  isPublic?: boolean;
  isOwner?: boolean;
  accessRole?: "owner" | "editor" | "viewer";
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-600",
  QUEUED: "bg-amber-600",
  PROCESSING: "bg-yellow-600",
  COMPLETE: "bg-green-600",
  FAILED: "bg-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  "2D_PLAN": "2D Plan",
  "3D_MODEL": "3D Model",
  FULL_CONVERSION: "Full Conversion",
};

export function ProjectCard({ project }: { project: Project }) {
  const [shareLoading, setShareLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const canEdit = project.isOwner !== false && project.accessRole !== "viewer"
    ? true
    : project.accessRole === "editor";
  const primaryHref = canEdit ? `/editor/${project.id}` : `/view/${project.id}`;
  const shareDisabled = !project.isPublic && project.isOwner === false;
  const thumbUrl =
    project.thumbnailUrl && project.thumbnailUrl.startsWith("/api/projects/")
      ? `${project.thumbnailUrl}${project.thumbnailUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(
          new Date(project.updatedAt).getTime()
        )}`
      : project.thumbnailUrl;

  const handleShare = async () => {
    setShareLoading(true);
    try {
      const origin = window.location.origin;
      let token: string | null = null;

      if (shareDisabled) {
        throw new Error("Only the owner can create a share link for a private project");
      }

      if (!project.isPublic) {
        const res = await fetch(`/api/projects/${project.id}/share-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as {
          shareToken?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data?.error || "Failed to create share token");
        }
        token = data.shareToken ?? null;
      }

      const url =
        project.isPublic || !token
          ? `${origin}/view/${project.id}`
          : `${origin}/view/${project.id}?token=${encodeURIComponent(token)}`;

      await navigator.clipboard.writeText(url);
      toast.success("Share link copied!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to copy share link";
      toast.error(msg);
    } finally {
      setShareLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project.isOwner) return;
    if (!confirm(`Delete "${project.title}"? This action cannot be undone.`)) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to delete project");
      toast.success("Project deleted");
      // Refresh the page to update the list
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete project";
      toast.error(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="group rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700 transition overflow-hidden">
      <div className="relative aspect-video bg-gray-800 flex items-center justify-center">
        <Link href={primaryHref} className="absolute inset-0">
          <span className="sr-only">{canEdit ? "Open editor" : "Open viewer"}</span>
        </Link>
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl opacity-30">🏠</span>
        )}
        <Link
          href={`/view/${project.id}`}
          target="_blank"
          rel="noreferrer"
          className="absolute top-3 right-3 px-2.5 py-1 rounded-md text-[11px] border border-gray-700 bg-gray-950/70 text-gray-200 hover:bg-gray-900 transition"
          title={project.isPublic ? "View (public)" : "Preview (private)"}
          onClick={(e) => e.stopPropagation()}
        >
          {project.isPublic ? "View" : "Preview"}
        </Link>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`w-2 h-2 rounded-full ${STATUS_COLORS[project.status] || "bg-gray-600"}`}
          />
          <span className="text-xs text-gray-500">
            {TYPE_LABELS[project.type] || project.type}
          </span>
          {project.accessRole && project.accessRole !== "owner" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-700/60 bg-blue-600/10 text-blue-200">
              {project.accessRole === "editor" ? "Shared · Editor" : "Shared · Viewer"}
            </span>
          )}
          {project.isPublic && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-emerald-700/60 bg-emerald-600/10 text-emerald-200">
              Public
            </span>
          )}
        </div>
        <Link
          href={primaryHref}
          className="block text-sm font-medium text-white group-hover:text-blue-400 transition truncate"
        >
          {project.title}
        </Link>
        {project.description && (
          <p className="text-xs text-gray-500 mt-1 truncate">{project.description}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-600">
            Updated {new Date(project.updatedAt).toLocaleDateString()}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={primaryHref}
              className="px-2.5 py-1 rounded-md text-[11px] border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
            >
              {canEdit ? "Edit" : "Open"}
            </Link>
            <Link
              href={`/view/${project.id}`}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded-md text-[11px] border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
            >
              {project.isPublic ? "View" : "Preview"}
            </Link>
            {!shareDisabled && (
              <button
                onClick={handleShare}
                disabled={shareLoading}
                className={[
                  "px-2.5 py-1 rounded-md text-[11px] border transition",
                  shareLoading
                    ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                    : "border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800",
                ].join(" ")}
                title="Copy share link"
              >
                {shareLoading ? "Sharing..." : "Share"}
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleteLoading || !project.isOwner}
              className={[
                "px-2.5 py-1 rounded-md text-[11px] border transition",
                project.isOwner
                  ? deleteLoading
                    ? "border-red-800 bg-red-900 text-red-500 cursor-not-allowed"
                    : "border-red-800 bg-red-900/20 text-red-400 hover:bg-red-900/40"
                  : "hidden",
              ].join(" ")}
              title={project.isOwner ? "Delete project" : undefined}
              suppressHydrationWarning
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
