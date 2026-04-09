"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { FloorPlanDocV3 } from "@/lib/floorplan/types";

interface ConversionPanelProps {
  projectId: string;
  floorPlanData: FloorPlanDocV3 | null;
  currentStatus: string;
  onConversionComplete?: (modelUrl: string) => void;
}

type ConversionStatus = "idle" | "processing" | "complete" | "error";

export function ConversionPanel({
  projectId,
  floorPlanData,
  currentStatus,
  onConversionComplete,
}: ConversionPanelProps) {
  const [status, setStatus] = useState<ConversionStatus>(
    currentStatus === "COMPLETE" ? "complete" : "idle"
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = useCallback(async () => {
    if (!floorPlanData) {
      toast.error("No floor plan data available");
      return;
    }

    setStatus("processing");
    setProgress(0);
    setError(null);

    try {
      setProgress(10);
      const res = await fetch(`/api/convert/${projectId}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Conversion failed (${res.status})`);
      }

      const result = await res.json();
      setProgress(100);
      setStatus("complete");
      toast.success("3D model generated successfully!");

      if (onConversionComplete) {
        onConversionComplete(result.modelUrl);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed";
      setError(msg);
      setStatus("error");
      toast.error(msg);
    }
  }, [projectId, floorPlanData, onConversionComplete]);

  const hasWalls = floorPlanData && floorPlanData.walls.length > 0;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-medium text-white mb-3">2D → 3D Conversion</h3>

      {status === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Convert your 2D floor plan into a 3D model. This will cost{" "}
            <span className="text-white font-medium">3 credits</span>.
          </p>
          <button
            onClick={handleConvert}
            disabled={!hasWalls}
            className={[
              "w-full px-4 py-2 rounded-lg text-sm font-medium transition",
              hasWalls
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-800 text-gray-500 cursor-not-allowed",
            ].join(" ")}
          >
            {hasWalls ? "Generate 3D Model" : "Add walls to convert"}
          </button>
        </div>
      )}

      {status === "processing" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Generating 3D model...
          </div>
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500">{progress}% complete</p>
        </div>
      )}

      {status === "complete" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            3D model ready!
          </div>
          <button
            onClick={handleConvert}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
          >
            Regenerate
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="text-xs text-red-400">{error}</div>
          <button
            onClick={handleConvert}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
