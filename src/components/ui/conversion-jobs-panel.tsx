"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Job = {
  id: string;
  status: string;
  mode: string;
  modelUrl: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function fmtTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString();
}

function fmtMode(mode: string) {
  if (mode === "image") return "Image";
  if (mode === "floorplan") return "2D Plan";
  return mode;
}

export function ConversionJobsPanel({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [workerRunning, setWorkerRunning] = useState(false);
  const mountedRef = useRef(true);

  const hasActive = useMemo(
    () => jobs.some((job) => job.status === "QUEUED" || job.status === "PROCESSING"),
    [jobs]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/conversion/${projectId}?limit=5`, {
        method: "GET",
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { jobs?: Job[] } | null;
      if (mountedRef.current) setJobs(data?.jobs ?? []);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!hasActive) {
      setLive(false);
      return;
    }
    setLive(true);
    const t = window.setInterval(() => {
      void load();
    }, 1500);
    return () => window.clearInterval(t);
  }, [hasActive, load]);

  useEffect(() => {
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Conversion Jobs</h3>
        <div className="flex items-center gap-2">
          {live && (
            <span className="text-[10px] text-amber-300">Live</span>
          )}
          <button
            onClick={() => void load()}
            className="text-[11px] text-gray-400 hover:text-white transition"
          >
            Refresh
          </button>
          {process.env.NODE_ENV === "development" && (
            <button
              disabled={workerRunning}
              onClick={async () => {
                setWorkerRunning(true);
                try {
                  const res = await fetch("/api/jobs/conversion/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ limit: 3 }),
                  });
                  if (!res.ok) return;
                  await res.json().catch(() => null);
                  await load();
                } finally {
                  if (mountedRef.current) setWorkerRunning(false);
                }
              }}
              className={[
                "text-[11px] transition",
                workerRunning
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-amber-300 hover:text-amber-200",
              ].join(" ")}
              title="Run queued jobs (dev only)"
            >
              {workerRunning ? "Running…" : "Run worker"}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="mt-3 text-[11px] text-gray-500">Loading...</div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="mt-3 text-[11px] text-gray-500">No jobs yet.</div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="mt-3 space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-gray-400">
                  {fmtMode(job.mode)} • {fmtTime(job.createdAt)}
                </div>
                <div className="flex items-center gap-2">
                  {job.status === "FAILED" && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/convert/${projectId}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              enqueueOnly: true,
                              mode: job.mode === "image" ? "image" : "floorplan",
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            throw new Error(data?.error || "Retry failed");
                          }
                          toast.success("Conversion re-queued.");
                          await load();
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Retry failed";
                          toast.error(msg);
                        }
                      }}
                      className="text-[10px] text-amber-300 hover:text-amber-200 transition"
                      title="Re-queue conversion (uses credits)"
                    >
                      Retry
                    </button>
                  )}
                  <span
                    className={[
                      "text-[10px] px-2 py-0.5 rounded-full border",
                      job.status === "COMPLETE"
                        ? "border-emerald-700/60 bg-emerald-600/15 text-emerald-200"
                        : job.status === "FAILED"
                          ? "border-red-700/60 bg-red-600/15 text-red-200"
                          : job.status === "PROCESSING"
                            ? "border-yellow-700/60 bg-yellow-600/15 text-yellow-200"
                            : "border-amber-700/60 bg-amber-600/15 text-amber-200",
                    ].join(" ")}
                  >
                    {job.status}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                Started: {fmtTime(job.startedAt)} • Finished: {fmtTime(job.finishedAt)}
              </div>
              {job.error && (
                <div className="mt-1 text-[11px] text-red-300">{job.error}</div>
              )}
              {job.modelUrl && (
                <div className="mt-1 text-[11px] text-gray-400 truncate">
                  Model: {job.modelUrl}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
