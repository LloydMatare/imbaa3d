"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface GenerateModelButtonProps {
  projectId: string;
}

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

export function GenerateModelButton({ projectId }: GenerateModelButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);

  const handleConvert = useCallback(async () => {
    setErrorMsg(null);
    setStatus("credits");
    setProgress(10);

    try {
      setStatus("generating");
      setProgress(40);

      const res = await fetch(`/api/convert/${projectId}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error || `Conversion failed (${res.status})`
        );
      }

      const result = await res.json().catch(() => null) as { modelUrl?: string | null; status?: string; jobId?: string | null } | null;
      setStatus("processing");
      setProgress(85);

      if (result?.status === "QUEUED") {
        setStatus("queued");
        setProgress(100);
        setQueuedJobId(result?.jobId ?? null);
        toast.success("Conversion queued.");
        return;
      }

      if (!result?.modelUrl) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 60_000) {
          const st = await fetch(`/api/convert/${projectId}`, { method: "GET" });
          const data = await st.json().catch(() => null) as { status?: string; modelUrl?: string | null; job?: { status?: string; error?: string | null } | null } | null;
          if (data?.modelUrl) break;
          if (data?.status === "FAILED" || data?.job?.status === "FAILED") {
            throw new Error(data?.job?.error || "Conversion failed");
          }
          await new Promise((r) => setTimeout(r, 750));
        }
      }

      setProgress(100);
      setStatus("done");
      toast.success("3D model generated!");

      // Refresh the page to show the model, after a brief delay
      setTimeout(() => {
        router.refresh();
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed";
      setErrorMsg(msg);
      setStatus("error");
      toast.error(msg);
    }
  }, [projectId, router]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setErrorMsg(null);
    setProgress(0);
  }, []);

  const isConverting =
    status !== "idle" &&
    status !== "confirming" &&
    status !== "done" &&
    status !== "error";

  // Error state
  if (status === "error") {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-700/60 bg-red-600/15">
          <svg
            className="w-4 h-4 text-red-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-xs text-red-200">{errorMsg ?? "Failed"}</span>
        </div>
        <button
          onClick={handleRetry}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Done state
  if (status === "done") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-700/60 bg-emerald-600/15">
        <svg
          className="w-4 h-4 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span className="text-xs text-emerald-200">
          Model generated! Loading...
        </span>
      </div>
    );
  }

  // Converting state
  if (isConverting) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-blue-700/60 bg-blue-600/15">
        <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <div>
          <div className="text-xs text-blue-200">
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
          </div>
          <div className="mt-1 w-32 h-1.5 rounded-full bg-blue-900/50 overflow-hidden">
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
      <div className="flex items-center gap-3">
        <button
          onClick={handleConvert}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          Confirm (3 credits)
        </button>
        <button
          onClick={() => setStatus("idle")}
          className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Idle state
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setStatus("confirming")}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
        title="Generate 3D model from floor plan (3 credits)"
      >
        Generate 3D Model
      </button>
      {queuedJobId && (
        <span className="text-[11px] text-gray-500">
          Last job {queuedJobId.slice(0, 6)}
        </span>
      )}
    </div>
  );
}
