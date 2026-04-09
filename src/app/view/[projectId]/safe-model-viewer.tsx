"use client";

import { useEffect, useState } from "react";
import { ModelViewerScene } from "./model-viewer-scene";
import type { FloorPlanDocV3 } from "@/lib/floorplan/types";

interface SafeModelViewerProps {
  url: string;
  projectId: string;
  floorPlanData?: FloorPlanDocV3 | null;
  sceneConfig?: unknown;
  canSaveThumbnail?: boolean;
  canExportImage?: boolean;
  canEditStaging?: boolean;
}

export function SafeModelViewer({
  url,
  projectId,
  floorPlanData,
  sceneConfig,
  canSaveThumbnail,
  canExportImage,
  canEditStaging,
}: SafeModelViewerProps) {
  const [status, setStatus] = useState<"checking" | "ready" | "missing">("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkModel() {
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (!cancelled) {
          setStatus(res.ok ? "ready" : "missing");
        }
      } catch {
        if (!cancelled) {
          setStatus("missing");
        }
      }
    }

    checkModel();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (status === "checking") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">Model not found</h1>
        <p className="text-sm text-gray-400 mt-2">
          The 3D model data is missing. Regenerate it from the editor.
        </p>
        <a
          href={`/editor/${projectId}`}
          className="inline-block mt-4 px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          Open Editor
        </a>
      </div>
    );
  }

  return (
    <ModelViewerScene
      url={url}
      floorPlanData={floorPlanData}
      sceneConfig={sceneConfig}
      projectId={projectId}
      canSaveThumbnail={canSaveThumbnail}
      canExportImage={canExportImage}
      canEditStaging={canEditStaging}
    />
  );
}
