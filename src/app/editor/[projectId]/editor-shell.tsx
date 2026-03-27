"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  FloorPlanEditor,
  type FloorPlanEditorHandle,
} from "@/components/canvas/floor-plan-editor";
import { useFloorPlanStore } from "@/lib/store/use-floorplan-store";
import type { FloorPlanItemType } from "@/lib/floorplan/types";
import { PropertiesPanel } from "./properties-panel";
import Image from "next/image";

interface Project {
  id: string;
  title: string;
  type: string;
  status: string;
  modelUrl: string | null;
  floorPlanData: unknown;
}

export function EditorShell({ project }: { project: Project }) {
  const editorRef = useRef<FloorPlanEditorHandle | null>(null);
  const dragPreviewElRef = useRef<HTMLElement | null>(null);
  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const furnitureType = useFloorPlanStore((s) => s.furnitureType);
  const setFurnitureType = useFloorPlanStore((s) => s.setFurnitureType);

  const [assetQuery, setAssetQuery] = useState("");
  const [assetCategory, setAssetCategory] = useState<
    "All" | "Living" | "Bedroom" | "Dining" | "Kitchen" | "Bathroom" | "Office" | "Other"
  >("All");
  const [dragActive, setDragActive] = useState(false);

  const assets = useMemo(() => {
    const all: { type: FloorPlanItemType; label: string; category: string }[] = [
      { type: "sofa", label: "Sofa", category: "Living" },
      { type: "chair", label: "Chair", category: "Living" },
      { type: "table", label: "Coffee Table", category: "Living" },
      { type: "bookshelf", label: "Bookshelf", category: "Living" },
      { type: "bed", label: "Bed", category: "Bedroom" },
      { type: "wardrobe", label: "Wardrobe", category: "Bedroom" },
      { type: "table", label: "Dining Table", category: "Dining" },
      { type: "stove", label: "Stove", category: "Kitchen" },
      { type: "sink", label: "Sink", category: "Kitchen" },
      { type: "fridge", label: "Fridge", category: "Kitchen" },
      { type: "toilet", label: "Toilet", category: "Bathroom" },
      { type: "bathtub", label: "Bathtub", category: "Bathroom" },
      { type: "desk", label: "Desk", category: "Office" },
      { type: "generic", label: "Generic Block", category: "Other" },
    ];

    const q = assetQuery.trim().toLowerCase();
    return all.filter((a) => {
      if (assetCategory !== "All" && a.category !== assetCategory) return false;
      if (!q) return true;
      return a.label.toLowerCase().includes(q) || a.type.includes(q);
    });
  }, [assetCategory, assetQuery]);

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
        <div className="flex-1" />
        <button
          onClick={() => editorRef.current?.saveNow()}
          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition"
          type="button"
        >
          Save
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex">
        {/* Left sidebar - asset library */}
        <div className="w-72 border-r border-gray-800 bg-gray-950/70 backdrop-blur-sm shrink-0 hidden lg:flex flex-col">
          <div className="p-3 border-b border-gray-800">
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

          <div className="p-3 overflow-auto">
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
          />
        </div>

        <PropertiesPanel />
      </div>
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
    generic: "/assets/floorplan-icons/generic.svg",
  };
  return map[type];
}

function setAssetDragPreview(args: {
  e: React.DragEvent;
  type: FloorPlanItemType;
  label: string;
  dragPreviewElRef: React.RefObject<HTMLElement | null>;
}) {
  const { e, type, label, dragPreviewElRef } = args;
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
  img.src = iconSrcForAsset(type);
  img.width = 24;
  img.height = 24;
  img.style.opacity = "0.9";
  img.style.filter = "invert(1)";

  const txt = document.createElement("div");
  txt.style.display = "flex";
  txt.style.flexDirection = "column";
  txt.style.lineHeight = "1.1";
  const t1 = document.createElement("div");
  t1.textContent = label;
  t1.style.fontWeight = "600";
  const t2 = document.createElement("div");
  t2.textContent = "Drop to place";
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
