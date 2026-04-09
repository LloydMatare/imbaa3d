"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  status: string;
  mode?: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export function ConversionStatusPill({ projectId }: { projectId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;

    async function tick() {
      if (cancelled) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/convert/${projectId}`, { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | { status?: string; job?: Job | null }
          | null;
        if (cancelled) return;
        setProjectStatus(data?.status ?? null);
        setJob(data?.job ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Initial fetch, then poll only while processing.
    void tick();
    t = window.setInterval(() => {
      const st = job?.status ?? projectStatus;
      if (st === "PROCESSING" || st === "QUEUED") {
        void tick();
      }
    }, 1250);

    return () => {
      cancelled = true;
      if (t) window.clearInterval(t);
    };
  }, [job?.status, projectId, projectStatus]);

  const st = job?.status ?? projectStatus;
  if (!st) return null;
  const modeLabel = job?.mode === "image" ? "Image" : job?.mode === "floorplan" ? "2D" : null;

  const color =
    st === "COMPLETE"
      ? "border-emerald-700/60 bg-emerald-600/15 text-emerald-200"
      : st === "FAILED"
        ? "border-red-700/60 bg-red-600/15 text-red-200"
        : st === "PROCESSING" || st === "QUEUED"
          ? "border-yellow-700/60 bg-yellow-600/15 text-yellow-200"
          : "border-gray-800 bg-gray-900 text-gray-300";

  const label =
    st === "QUEUED"
      ? "Queued"
      : st === "PROCESSING"
        ? "Processing"
        : st === "COMPLETE"
          ? "Complete"
          : st === "FAILED"
            ? "Failed"
            : st;

  return (
    <div
      className={[
        "px-2 py-0.5 rounded-full border text-[11px] flex items-center gap-2",
        color,
      ].join(" ")}
      title={st === "FAILED" && job?.error ? job.error : undefined}
    >
      {(st === "PROCESSING" || st === "QUEUED" || loading) && (
        <span className="inline-block h-2.5 w-2.5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-80" />
      )}
      <span>Conversion{modeLabel ? ` (${modeLabel})` : ""}: {label}</span>
    </div>
  );
}
