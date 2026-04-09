"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Version {
  id: string;
  label: string | null;
  createdAt: string;
}

interface VersionHistoryProps {
  projectId: string;
  onRestore?: (floorPlanData: unknown) => void;
}

export function VersionHistory({ projectId, onRestore }: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions ?? []);
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    if (open) fetchVersions();
  }, [open, fetchVersions]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Snapshot ${new Date().toLocaleTimeString()}` }),
      });
      if (!res.ok) throw new Error("Failed to save version");
      toast.success("Version saved!");
      await fetchVersions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }, [projectId, fetchVersions]);

  const handleRestore = useCallback(
    async (versionId: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/versions/${versionId}`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to restore version");
        const data = (await res.json().catch(() => null)) as { floorPlanData?: unknown } | null;
        toast.success("Version restored!");
        if (onRestore) onRestore(data?.floorPlanData ?? null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      } finally {
        setLoading(false);
      }
    },
    [projectId, onRestore]
  );

  const handleDelete = useCallback(
    async (versionId: string) => {
      if (!confirm("Delete this snapshot? This cannot be undone.")) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/versions/${versionId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete version");
        toast.success("Version deleted.");
        await fetchVersions();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      } finally {
        setLoading(false);
      }
    },
    [projectId, fetchVersions]
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
        title="Version history"
      >
        History
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 rounded-lg border border-gray-800 bg-gray-950 shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <div className="text-xs font-medium text-white">Version History</div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-1 rounded text-[11px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : "Save Snapshot"}
            </button>
          </div>
          <div className="max-h-64 overflow-auto">
            {versions.length === 0 ? (
              <div className="p-4 text-xs text-gray-500 text-center">
                No snapshots yet. Click &quot;Save Snapshot&quot; to create one.
              </div>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className="px-3 py-2 border-b border-gray-800/50 hover:bg-gray-900/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-200 truncate">
                        {v.label || "Untitled"}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {new Date(v.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRestore(v.id)}
                        disabled={loading}
                        className="px-2 py-1 rounded text-[10px] border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition shrink-0"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        disabled={loading}
                        className="px-2 py-1 rounded text-[10px] border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
