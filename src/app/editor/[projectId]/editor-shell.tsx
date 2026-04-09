"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FloorPlanEditor,
  type FloorPlanEditorHandle,
} from "@/components/canvas/floor-plan-editor";
import { useFloorPlanStore } from "@/lib/store/use-floorplan-store";
import type { FloorPlanItemType } from "@/lib/floorplan/types";
import { PropertiesPanel } from "./properties-panel";
import Image from "next/image";
import { toast } from "sonner";
import { ConversionButton } from "@/components/ui/conversion-button";
import { VersionHistory } from "@/components/ui/version-history";
import { ConversionStatusPill } from "@/components/ui/conversion-status-pill";
import { ProjectTeam } from "@/components/editor/project-team";

interface Project {
  id: string;
  title: string;
  type: string;
  status: string;
  modelUrl: string | null;
  floorPlanData: unknown;
  isPublic: boolean;
  isOwner?: boolean;
}

export function EditorShell({ project, isOwner }: { project: Project; isOwner: boolean }) {
  project.isOwner = isOwner;
  const editorRef = useRef<FloorPlanEditorHandle | null>(null);
  const dragPreviewElRef = useRef<HTMLElement | null>(null);
  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const furnitureType = useFloorPlanStore((s) => s.furnitureType);
  const setFurnitureType = useFloorPlanStore((s) => s.setFurnitureType);
  const placementRotation = useFloorPlanStore((s) => s.placementRotation);
  const setPlacementRotation = useFloorPlanStore((s) => s.setPlacementRotation);

  const [assetQuery, setAssetQuery] = useState("");
  const [assetCategory, setAssetCategory] = useState<
    "All" | "Living" | "Bedroom" | "Dining" | "Kitchen" | "Bathroom" | "Office" | "Other"
  >("All");
  const [dragActive, setDragActive] = useState(false);
  const [isPublic, setIsPublic] = useState(project.isPublic);
  const [publishing, setPublishing] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(project.modelUrl ?? null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);

  const walls = useFloorPlanStore((s) => s.walls);
  const hasWalls = walls.length > 0;

  useEffect(() => {
    let cancelled = false;
    async function loadExistingReference() {
      try {
        const res = await fetch(`/api/upload/${project.id}`, { method: "HEAD" });
        const contentType = res.headers.get("content-type") || "";
        const isImage = contentType.startsWith("image/");
        if (!cancelled && res.ok && isImage) {
          setReferenceImageUrl(`/api/upload/${project.id}`);
        }
      } catch {
        // ignore
      }
    }
    loadExistingReference();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (!dragActive) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== "r") return;
      e.preventDefault();
      // Avoid also triggering the canvas-level R handler while dragging.
      e.stopPropagation();
      e.stopImmediatePropagation();
      const d = e.shiftKey ? -90 : 90;
      const next = (placementRotation + d) % 360;
      const rot = next < 0 ? next + 360 : next;
      setPlacementRotation(rot);
      updateAssetDragPreviewRotation(dragPreviewElRef, rot);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dragActive, placementRotation, setPlacementRotation]);

  const assets = useMemo(() => {
    const all: { type: FloorPlanItemType; label: string; category: string }[] = [
      { type: "sofa", label: "Sofa", category: "Living" },
      { type: "chair", label: "Chair", category: "Living" },
      { type: "table", label: "Coffee Table", category: "Living" },
      { type: "bookshelf", label: "Bookshelf", category: "Living" },
      { type: "lamp", label: "Floor Lamp", category: "Living" },
      { type: "tv", label: "TV Stand", category: "Living" },
      { type: "bed", label: "Bed", category: "Bedroom" },
      { type: "wardrobe", label: "Wardrobe", category: "Bedroom" },
      { type: "mirror", label: "Mirror", category: "Bedroom" },
      { type: "table", label: "Dining Table", category: "Dining" },
      { type: "stove", label: "Stove", category: "Kitchen" },
      { type: "sink", label: "Sink", category: "Kitchen" },
      { type: "fridge", label: "Fridge", category: "Kitchen" },
      { type: "dishwasher", label: "Dishwasher", category: "Kitchen" },
      { type: "toilet", label: "Toilet", category: "Bathroom" },
      { type: "bathtub", label: "Bathtub", category: "Bathroom" },
      { type: "washer", label: "Washer", category: "Bathroom" },
      { type: "desk", label: "Desk", category: "Office" },
      { type: "car", label: "Car", category: "Exterior" },
      { type: "flowerpot", label: "Flower Pot", category: "Exterior" },
      { type: "generic", label: "Generic Block", category: "Other" },
    ];

    const q = assetQuery.trim().toLowerCase();
    return all.filter((a) => {
      if (assetCategory !== "All" && a.category !== assetCategory) return false;
      if (!q) return true;
      return a.label.toLowerCase().includes(q) || a.type.includes(q);
    });
  }, [assetCategory, assetQuery]);

  async function updatePublic(next: boolean) {
    if (publishing) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Update failed (${res.status})`);
      }
      const updated = (await res.json().catch(() => null)) as { isPublic?: boolean } | null;
      setIsPublic(updated?.isPublic ?? next);
      toast.success(next ? "Project is now public" : "Project is now private");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      toast.error(msg);
      setIsPublic((prev) => prev); // keep current
    } finally {
      setPublishing(false);
    }
  }

  async function copyViewLink() {
    const origin = window.location.origin;
    let url = `${origin}/view/${project.id}`;

    if (!isPublic) {
      const res = await fetch(`/api/projects/${project.id}/share-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || `Failed to create share link (${res.status})`);
      }
      const data = (await res.json().catch(() => null)) as { shareToken?: string } | null;
      if (!data?.shareToken) {
        throw new Error("Failed to create share link");
      }
      url = `${origin}/view/${project.id}?token=${encodeURIComponent(data.shareToken)}`;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success(isPublic ? "View link copied" : "Share link copied");
    } catch {
      // Fallback for older/blocked clipboard APIs.
      const input = document.createElement("input");
      input.value = url;
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      toast.success(isPublic ? "View link copied" : "Share link copied");
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="h-12 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
        <Link
          href="/dashboard"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          ← Back
        </Link>
        <div className="h-4 w-px bg-gray-800" />
        <h1 className="text-sm font-medium text-white truncate">
          {project.title}
        </h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
          {project.status}
        </span>
        <ConversionStatusPill projectId={project.id} />
        <button
          type="button"
          disabled={publishing}
          onClick={() => void updatePublic(!isPublic)}
          className={[
            "text-xs px-2 py-0.5 rounded-full border transition",
            isPublic
              ? "bg-emerald-600/15 text-emerald-200 border-emerald-700/60 hover:bg-emerald-600/20"
              : "bg-gray-900 text-gray-300 border-gray-800 hover:bg-gray-800",
            publishing ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
          title={isPublic ? "Public: anyone with the link can view" : "Private: only you can view"}
        >
          {isPublic ? "Public" : "Private"}
        </button>
        <div className="flex-1" />
        <Link
          href={`/view/${project.id}`}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          title={
            isPublic
              ? "Open public viewer in a new tab"
              : "Preview viewer in a new tab (private)"
          }
        >
          {isPublic ? "View" : "Preview"}
        </Link>
        <button
          type="button"
          onClick={() => void copyViewLink()}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          title={isPublic ? "Copy /view link" : "Copy private share link"}
        >
          Copy Link
        </button>
        <button
          type="button"
          onClick={() => setShowTeamModal(true)}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          title="Manage project team"
        >
          Team
        </button>
        <button
          type="button"
          onClick={() => editorRef.current?.suggestFurniture()}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          title="AI furniture suggestions"
        >
          Suggest Furniture
        </button>
        <ConversionButton
          projectId={project.id}
          hasWalls={hasWalls}
          hasReferenceImage={Boolean(referenceImageUrl)}
          modelUrl={modelUrl}
          onModelReady={(url) => setModelUrl(url)}
        />
        <button
          onClick={() => editorRef.current?.exportPng()}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          type="button"
          title="Export floor plan as PNG"
        >
          Export PNG
        </button>
        <button
          onClick={() => editorRef.current?.exportPdf()}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
          type="button"
          title="Export floor plan as PDF with scale"
        >
          Export PDF
        </button>
        <a
          href={`/api/projects/${project.id}/export/floorplan`}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition hidden md:inline-flex"
          title="Download floor plan JSON"
        >
          Download JSON
        </a>
        <button
          onClick={() => editorRef.current?.exportPng()}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
        >
          Export PNG
        </button>
        <button
          onClick={() => editorRef.current?.exportPdf()}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
        >
          Export PDF
        </button>
        <VersionHistory
          projectId={project.id}
          onRestore={(doc) => {
            if (doc) {
              editorRef.current?.loadDoc(doc);
            }
          }}
        />
      </div>

      {/* Editor area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left sidebar - asset library */}
        <div className="w-72 border-r border-gray-800 bg-gray-950/70 backdrop-blur-sm shrink-0 hidden lg:flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800 shrink-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Asset Library
            </div>
            <input
              value={assetQuery}
              onChange={(e) => setAssetQuery(e.target.value)}
              placeholder="Search assets..."
              className="mt-2 w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
            />
            <div className="mt-2 flex gap-2 flex-wrap">
              {(
                ["All", "Living", "Bedroom", "Dining", "Kitchen", "Bathroom", "Office", "Other"] as const
              ).map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAssetCategory(c)}
                    className={[
                      "px-2 py-1 rounded-md text-[11px] border transition",
                      assetCategory === c
                        ? "bg-blue-600 text-white border-blue-500"
                        : "bg-gray-900 text-gray-300 border-gray-800 hover:bg-gray-800",
                    ].join(" ")}
                  >
                    {c}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="p-3 overflow-auto flex-1 min-h-0">
            {assets.length === 0 ? (
              <div className="text-xs text-gray-600">No matches.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {assets.map((a, i) => {
                  const active = tool === "furniture" && furnitureType === a.type;
                  return (
                    <button
                      key={`${a.type}-${a.label}-${i}`}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDragActive(true);
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("application/x-imbaa3d-asset", a.type);
                        setAssetDragPreview({
                          e,
                          type: a.type,
                          label: a.label,
                          dragPreviewElRef,
                          rotation: placementRotation,
                        });
                      }}
                      onDragEnd={() => {
                        setDragActive(false);
                        cleanupAssetDragPreview(dragPreviewElRef);
                      }}
                      onClick={() => {
                        setFurnitureType(a.type);
                        setTool("furniture");
                      }}
                      className={[
                        "text-left px-3 py-2 rounded-lg border transition",
                        active
                          ? "bg-blue-600/20 border-blue-500 text-white"
                          : "bg-gray-900 border-gray-800 text-gray-200 hover:bg-gray-800",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <AssetIcon type={a.type} />
                        <div className="min-w-0">
                          <div className="text-xs font-medium">{a.label}</div>
                          <div className="text-[11px] text-gray-500">
                            {a.category} • drag or click
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          className={[
            "flex-1 relative",
            dragActive ? "ring-1 ring-blue-600/60 bg-blue-600/5" : "",
          ].join(" ")}
          onDragEnter={(e) => {
            if (e.dataTransfer.types.includes("application/x-imbaa3d-asset")) {
              setDragActive(true);
            }
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("application/x-imbaa3d-asset")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            const type = e.dataTransfer.getData(
              "application/x-imbaa3d-asset"
            ) as FloorPlanItemType;
            if (!type) return;
            e.preventDefault();
            setDragActive(false);
            cleanupAssetDragPreview(dragPreviewElRef);
            editorRef.current?.placeFurnitureAtClientPoint(
              type,
              e.clientX,
              e.clientY
            );
          }}
        >
          <FloorPlanEditor
            ref={editorRef}
            projectId={project.id}
            initialFloorPlanData={project.floorPlanData}
            referenceImageUrl={referenceImageUrl}
          />
        </div>

        <PropertiesPanel projectId={project.id} onImageUpload={(url) => setReferenceImageUrl(url)} />
      </div>

      {showTeamModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold">Project Team</h2>
              <button
                onClick={() => setShowTeamModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <ProjectTeam projectId={project.id} isOwner={project.isOwner ?? false} />
          </div>
        </div>
      )}
    </div>
  );
}

function AssetIcon({ type }: { type: FloorPlanItemType }) {
  const meta: Record<
    FloorPlanItemType,
    { bg: string; fg: string; text: string; icon: string }
  > = {
    sofa: {
      bg: "bg-emerald-950/50",
      fg: "text-emerald-200",
      text: "SF",
      icon: "/assets/floorplan-icons/sofa.svg",
    },
    bed: {
      bg: "bg-indigo-950/50",
      fg: "text-indigo-200",
      text: "BD",
      icon: "/assets/floorplan-icons/bed.svg",
    },
    table: {
      bg: "bg-amber-950/50",
      fg: "text-amber-200",
      text: "TB",
      icon: "/assets/floorplan-icons/table.svg",
    },
    chair: {
      bg: "bg-cyan-950/50",
      fg: "text-cyan-200",
      text: "CH",
      icon: "/assets/floorplan-icons/chair.svg",
    },
    desk: {
      bg: "bg-sky-950/50",
      fg: "text-sky-200",
      text: "DK",
      icon: "/assets/floorplan-icons/desk.svg",
    },
    toilet: {
      bg: "bg-slate-950/50",
      fg: "text-slate-200",
      text: "WC",
      icon: "/assets/floorplan-icons/toilet.svg",
    },
    sink: {
      bg: "bg-blue-950/50",
      fg: "text-blue-200",
      text: "SK",
      icon: "/assets/floorplan-icons/sink.svg",
    },
    bathtub: {
      bg: "bg-fuchsia-950/50",
      fg: "text-fuchsia-200",
      text: "BT",
      icon: "/assets/floorplan-icons/bathtub.svg",
    },
    stove: {
      bg: "bg-red-950/50",
      fg: "text-red-200",
      text: "ST",
      icon: "/assets/floorplan-icons/stove.svg",
    },
    fridge: {
      bg: "bg-violet-950/50",
      fg: "text-violet-200",
      text: "FR",
      icon: "/assets/floorplan-icons/fridge.svg",
    },
    wardrobe: {
      bg: "bg-rose-950/50",
      fg: "text-rose-200",
      text: "WR",
      icon: "/assets/floorplan-icons/wardrobe.svg",
    },
    bookshelf: {
      bg: "bg-orange-950/50",
      fg: "text-orange-200",
      text: "BS",
      icon: "/assets/floorplan-icons/bookshelf.svg",
    },
    lamp: {
      bg: "bg-yellow-950/50",
      fg: "text-yellow-200",
      text: "LM",
      icon: "/assets/floorplan-icons/lamp.svg",
    },
    tv: {
      bg: "bg-slate-800/50",
      fg: "text-slate-300",
      text: "TV",
      icon: "/assets/floorplan-icons/tv.svg",
    },
    mirror: {
      bg: "bg-indigo-900/50",
      fg: "text-indigo-300",
      text: "MR",
      icon: "/assets/floorplan-icons/mirror.svg",
    },
    dishwasher: {
      bg: "bg-cyan-900/50",
      fg: "text-cyan-300",
      text: "DW",
      icon: "/assets/floorplan-icons/dishwasher.svg",
    },
    washer: {
      bg: "bg-green-900/50",
      fg: "text-green-300",
      text: "WS",
      icon: "/assets/floorplan-icons/washer.svg",
    },
    car: {
      bg: "bg-red-900/50",
      fg: "text-red-300",
      text: "CR",
      icon: "/assets/floorplan-icons/generic.svg",
    },
    flowerpot: {
      bg: "bg-lime-900/50",
      fg: "text-lime-300",
      text: "FP",
      icon: "/assets/floorplan-icons/generic.svg",
    },
    cabinet: {
      bg: "bg-amber-950/50",
      fg: "text-amber-200",
      text: "CB",
      icon: "/assets/floorplan-icons/generic.svg",
    },
    shelf: {
      bg: "bg-orange-950/50",
      fg: "text-orange-200",
      text: "SH",
      icon: "/assets/floorplan-icons/generic.svg",
    },
    plant: {
      bg: "bg-green-950/50",
      fg: "text-green-200",
      text: "PL",
      icon: "/assets/floorplan-icons/generic.svg",
    },
    generic: {
      bg: "bg-gray-900",
      fg: "text-gray-200",
      text: "GX",
      icon: "/assets/floorplan-icons/generic.svg",
    },
  };
  const m = meta[type];
  return (
    <div
      className={[
        "h-9 w-9 rounded-lg border border-gray-800 grid place-items-center",
        m.bg,
        m.fg,
      ].join(" ")}
      aria-hidden
    >
      <Image
        src={m.icon}
        alt=""
        width={22}
        height={22}
        unoptimized
        className="opacity-90"
        onError={(e) => {
          // If SVG import/serve fails for some reason, fall back to letters.
          const img = e.currentTarget;
          img.style.display = "none";
          const parent = img.parentElement;
          if (!parent) return;
          const span = document.createElement("span");
          span.textContent = m.text;
          span.className = "text-[10px] font-semibold tracking-wide";
          parent.appendChild(span);
        }}
      />
    </div>
  );
}

function cleanupAssetDragPreview(ref: React.RefObject<HTMLElement | null>) {
  const el = ref.current;
  if (!el) return;
  el.remove();
  ref.current = null;
}

function updateAssetDragPreviewRotation(
  ref: React.RefObject<HTMLElement | null>,
  rotationDeg: number
) {
  const el = ref.current;
  if (!el) return;
  const img = el.querySelector('[data-role="asset-icon"]') as HTMLImageElement | null;
  if (img) img.style.transform = `rotate(${rotationDeg}deg)`;
  const txt = el.querySelector('[data-role="asset-subtitle"]') as HTMLElement | null;
  if (txt) txt.textContent = `Drop to place • R rotate (${rotationDeg}°)`;
}

function iconSrcForAsset(type: FloorPlanItemType) {
  const map: Record<FloorPlanItemType, string> = {
    sofa: "/assets/floorplan-icons/sofa.svg",
    bed: "/assets/floorplan-icons/bed.svg",
    table: "/assets/floorplan-icons/table.svg",
    chair: "/assets/floorplan-icons/chair.svg",
    desk: "/assets/floorplan-icons/desk.svg",
    toilet: "/assets/floorplan-icons/toilet.svg",
    sink: "/assets/floorplan-icons/sink.svg",
    bathtub: "/assets/floorplan-icons/bathtub.svg",
    stove: "/assets/floorplan-icons/stove.svg",
    fridge: "/assets/floorplan-icons/fridge.svg",
    wardrobe: "/assets/floorplan-icons/wardrobe.svg",
    bookshelf: "/assets/floorplan-icons/bookshelf.svg",
    lamp: "/assets/floorplan-icons/lamp.svg",
    tv: "/assets/floorplan-icons/tv.svg",
    mirror: "/assets/floorplan-icons/mirror.svg",
    dishwasher: "/assets/floorplan-icons/dishwasher.svg",
    washer: "/assets/floorplan-icons/washer.svg",
    car: "/assets/floorplan-icons/generic.svg",
    flowerpot: "/assets/floorplan-icons/generic.svg",
    cabinet: "/assets/floorplan-icons/generic.svg",
    shelf: "/assets/floorplan-icons/generic.svg",
    plant: "/assets/floorplan-icons/generic.svg",
    generic: "/assets/floorplan-icons/generic.svg",
  };
  return map[type];
}

function setAssetDragPreview(args: {
  e: React.DragEvent;
  type: FloorPlanItemType;
  label: string;
  dragPreviewElRef: React.RefObject<HTMLElement | null>;
  rotation: number;
}) {
  const { e, type, label, dragPreviewElRef, rotation } = args;
  cleanupAssetDragPreview(dragPreviewElRef);

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  el.style.width = "160px";
  el.style.height = "44px";
  el.style.border = "1px solid rgba(31,41,55,0.9)";
  el.style.borderRadius = "10px";
  el.style.background = "rgba(3,7,18,0.92)";
  el.style.backdropFilter = "blur(6px)";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.gap = "10px";
  el.style.padding = "8px 10px";
  el.style.color = "rgba(229,231,235,0.92)";
  el.style.fontSize = "12px";

  const img = document.createElement("img");
  img.setAttribute("data-role", "asset-icon");
  img.src = iconSrcForAsset(type);
  img.width = 24;
  img.height = 24;
  img.style.opacity = "0.9";
  img.style.filter = "invert(1)";
  img.style.transform = `rotate(${rotation}deg)`;

  const txt = document.createElement("div");
  txt.style.display = "flex";
  txt.style.flexDirection = "column";
  txt.style.lineHeight = "1.1";
  const t1 = document.createElement("div");
  t1.textContent = label;
  t1.style.fontWeight = "600";
  const t2 = document.createElement("div");
  t2.setAttribute("data-role", "asset-subtitle");
  t2.textContent = `Drop to place • R rotate (${rotation}°)`;
  t2.style.fontSize = "11px";
  t2.style.color = "rgba(156,163,175,0.95)";
  txt.appendChild(t1);
  txt.appendChild(t2);

  el.appendChild(img);
  el.appendChild(txt);
  document.body.appendChild(el);
  dragPreviewElRef.current = el;

  // Reasonable hotspot near the icon.
  e.dataTransfer.setDragImage(el, 18, 22);
}
