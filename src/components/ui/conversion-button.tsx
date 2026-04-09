"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { GenerationSettings } from "@/lib/floorplan/convert-to-3d";

interface ConversionButtonProps {
  projectId: string;
  hasWalls: boolean;
  hasReferenceImage?: boolean;
  modelUrl: string | null;
  onModelReady?: (url: string) => void;
}

const WALL_PRESETS = [
  { label: "White", hex: 0xffffff },
  { label: "Cream", hex: 0xf5f5dc },
  { label: "Gray", hex: 0x808080 },
];

const FLOOR_PRESETS = [
  { label: "Oak", hex: 0xc8a87e },
  { label: "Walnut", hex: 0x5c4033 },
  { label: "Gray", hex: 0x888888 },
];

type ConversionStatus =
  | "idle"
  | "confirming"
  | "credits"
  | "generating"
  | "queued"
  | "processing"
  | "done"
  | "error";

const STATUS_LABELS: Record<
  Exclude<ConversionStatus, "idle" | "confirming">,
  string
> = {
  credits: "Deducting credits...",
  generating: "Starting conversion...",
  queued: "Queued for processing...",
  processing: "Processing...",
  done: "Complete!",
  error: "Failed",
};

export function ConversionButton({
  projectId,
  hasWalls,
  hasReferenceImage,
  onModelReady,
}: ConversionButtonProps) {
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [enqueueOnly, setEnqueueOnly] = useState(false);
  const [mode, setMode] = useState<"floorplan" | "image">("floorplan");
  const [settings, setSettings] = useState<GenerationSettings>({
    wallHeight: 2.8,
    wallColor: 0xffffff,
    floorColor: 0xc8a87e,
    includeCeiling: true,
  });

  const handleConvert = useCallback(async () => {
    if (mode === "image" && !hasReferenceImage) {
      toast.error("Upload a reference image first.");
      return;
    }
    const effectiveEnqueueOnly = enqueueOnly || mode === "image";

    setErrorMsg(null);
    setStatus("credits");
    setProgress(10);

    try {
      setStatus("generating");
      setProgress(35);

      const res = await fetch(`/api/convert/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, enqueueOnly: effectiveEnqueueOnly, mode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Conversion failed (${res.status})`);
      }

      const result = await res.json().catch(() => ({})) as {
        status?: string;
        modelUrl?: string | null;
        jobId?: string | null;
      };

      if (result?.status === "QUEUED") {
        setStatus("queued");
        setProgress(100);
        toast.success("Conversion queued.");
        setTimeout(() => {
          setStatus("idle");
          setProgress(0);
        }, 1200);
        return;
      }

      setStatus("processing");
      setProgress(75);

      let modelUrl: string | null = result?.modelUrl ?? null;
      // If we ever make conversion async, poll status until COMPLETE/FAILED.
      if (!modelUrl) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 60_000) {
          const st = await fetch(`/api/convert/${projectId}`, { method: "GET" });
          const data = await st.json().catch(() => null) as { status?: string; modelUrl?: string | null; job?: { status?: string; error?: string | null } | null } | null;
          if (data?.modelUrl) {
            modelUrl = data.modelUrl;
            break;
          }
          if (data?.status === "FAILED" || data?.job?.status === "FAILED") {
            throw new Error(data?.job?.error || "Conversion failed");
          }
          await new Promise((r) => setTimeout(r, 750));
        }
      }

      if (!modelUrl) {
        setStatus("queued");
        setProgress(100);
        toast.success("Conversion queued.");
        setTimeout(() => {
          setStatus("idle");
          setProgress(0);
        }, 1200);
        return;
      }

      setProgress(100);
      setStatus("done");
      toast.success("3D model generated!");

      if (onModelReady) {
        if (modelUrl) onModelReady(modelUrl);
      }

      // Reset after a brief delay
      setTimeout(() => {
        setStatus("idle");
        setProgress(0);
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed";
      setErrorMsg(msg);
      setStatus("error");
      toast.error(msg);
    }
  }, [projectId, settings, enqueueOnly, mode, hasReferenceImage, onModelReady]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setErrorMsg(null);
    setProgress(0);
  }, []);

  const isConverting =
    status !== "idle" && status !== "confirming" && status !== "done" && status !== "error";

  // Error state
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-700/60 bg-red-600/15">
        <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-red-200 truncate max-w-[120px]" title={errorMsg ?? undefined}>
          {errorMsg ?? "Failed"}
        </span>
        <button
          onClick={handleRetry}
          className="text-xs text-red-300 hover:text-white underline shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  // Done state
  if (status === "done") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-emerald-700/60 bg-emerald-600/15">
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-xs text-emerald-200">Done!</span>
      </div>
    );
  }

  // Converting state
  if (isConverting) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-blue-700/60 bg-blue-600/15">
        <div className="h-3 w-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-blue-200 truncate">
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
          </div>
          <div className="w-full max-w-[100px] h-1.5 rounded-full bg-blue-900/50 overflow-hidden mt-0.5">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Confirmation state
  if (status === "confirming") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleConvert}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          Confirm (3 credits)
        </button>
        <button
          onClick={() => setStatus("idle")}
          className="px-2 py-1.5 rounded-md text-xs text-gray-400 hover:text-white transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Idle state
  const canConvert = mode === "floorplan" ? hasWalls : Boolean(hasReferenceImage);
  const disabledReason =
    mode === "floorplan"
      ? "Draw walls in the editor first"
      : "Upload a reference image first";

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => canConvert && setStatus("confirming")}
          disabled={!canConvert}
          className={[
            "px-3 py-1.5 rounded-md text-xs font-medium transition",
            canConvert
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-gray-800 text-gray-500 cursor-not-allowed",
          ].join(" ")}
          title={
            canConvert
              ? "Generate 3D model (3 credits)"
              : disabledReason
          }
        >
          Generate 3D
        </button>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="px-2 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-400 text-xs hover:bg-gray-800 hover:text-gray-200 transition"
          title="Generation settings"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {showSettings && (
        <div className="absolute top-full right-0 mt-1 w-64 rounded-lg border border-gray-800 bg-gray-950 shadow-xl z-50 p-3">
          <div className="text-xs font-medium text-white mb-3">Generation Settings</div>

          <div className="space-y-3">
            {process.env.NODE_ENV === "development" && (
              <label className="flex items-center gap-2 text-[11px] text-gray-300">
                <input
                  type="checkbox"
                  checked={enqueueOnly}
                  onChange={(e) => setEnqueueOnly(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-700 bg-gray-900"
                />
                Queue only (dev)
              </label>
            )}
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Conversion mode</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("floorplan")}
                  className={[
                    "px-2 py-1.5 rounded-md text-[11px] border transition",
                    mode === "floorplan"
                      ? "border-blue-600/70 bg-blue-600/20 text-blue-200"
                      : "border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800",
                  ].join(" ")}
                >
                  2D Plan
                </button>
                <button
                  type="button"
                  onClick={() => setMode("image")}
                  className={[
                    "px-2 py-1.5 rounded-md text-[11px] border transition",
                    mode === "image"
                      ? "border-blue-600/70 bg-blue-600/20 text-blue-200"
                      : "border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800",
                  ].join(" ")}
                >
                  Image
                </button>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                Image mode expects a reference upload and runs via the queue (AI stub).
              </div>
              {mode === "image" && !hasReferenceImage && (
                <div className="text-[10px] text-amber-300 mt-1">
                  Upload a reference image to enable image conversion.
                </div>
              )}
            </div>
            {process.env.NODE_ENV === "development" && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/jobs/conversion/run", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ limit: 1 }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data?.error || "Worker failed");
                    }
                    toast.success("Worker ran");
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Worker failed";
                    toast.error(msg);
                  }
                }}
                className="w-full px-2.5 py-1.5 rounded-md text-[11px] border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
              >
                Run queue worker (dev)
              </button>
            )}
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">Wall Height (m)</label>
              <input
                type="number"
                value={settings.wallHeight}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, wallHeight: parseFloat(e.target.value) || 2.8 }))
                }
                min={2}
                max={5}
                step={0.1}
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-1.5 outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">Wall Color</label>
              <div className="flex gap-1.5">
                {WALL_PRESETS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setSettings((s) => ({ ...s, wallColor: c.hex }))}
                    className={[
                      "w-7 h-7 rounded-md border transition",
                      settings.wallColor === c.hex
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : "border-gray-700 hover:border-gray-500",
                    ].join(" ")}
                    style={{ backgroundColor: `#${c.hex.toString(16).padStart(6, "0")}` }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">Floor Color</label>
              <div className="flex gap-1.5">
                {FLOOR_PRESETS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setSettings((s) => ({ ...s, floorColor: c.hex }))}
                    className={[
                      "w-7 h-7 rounded-md border transition",
                      settings.floorColor === c.hex
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : "border-gray-700 hover:border-gray-500",
                    ].join(" ")}
                    style={{ backgroundColor: `#${c.hex.toString(16).padStart(6, "0")}` }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={settings.includeCeiling}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, includeCeiling: e.target.checked }))
                }
                className="rounded"
              />
              Include ceiling
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
