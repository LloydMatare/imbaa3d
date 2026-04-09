"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface UploadPanelProps {
  projectId: string;
  onUploadComplete?: (imageUrl: string) => void;
}

type UploadStatus = "idle" | "uploading" | "processing" | "complete" | "error";

export function UploadPanel({ projectId, onUploadComplete }: UploadPanelProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedType, setUploadedType] = useState<string | null>(null);
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueDone, setQueueDone] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAiStatus() {
      setAiLoading(true);
      try {
        const res = await fetch("/api/ai/status", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | { configured?: boolean; url?: string }
          | null;
        if (cancelled) return;
        if (typeof data?.configured === "boolean") {
          setAiConfigured(data.configured);
        }
        if (typeof data?.url === "string") {
          setAiUrl(data.url);
        }
        if (typeof data?.configured === "boolean") return;
        setAiConfigured(false);
      } catch {
        if (!cancelled) setAiConfigured(false);
        // ignore
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }
    void loadAiStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const res = await fetch(`/api/upload/${projectId}?meta=1`, { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | { fileName?: string; contentType?: string; uploadedAt?: string }
          | null;
        if (cancelled) return;
        if (!data) return;
        setFileName(data?.fileName ?? "uploaded-plan");
        setUploadedType(data?.contentType ?? null);
        setUploadedAt(data?.uploadedAt ?? null);
        setStatus("complete");
        setProgress(100);
      } catch {
        // ignore
      }
    }
    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast.error("Please upload a JPG, PNG, WebP, or PDF file");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }

      setFileName(file.name);
      setUploadedType(file.type || null);
      setStatus("uploading");
      setProgress(10);
      setError(null);

      try {
        // Read file as data URL
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setProgress(40);
        setStatus("processing");

        // Upload to server
        const res = await fetch(`/api/upload/${projectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageData: dataUrl,
            fileName: file.name,
          }),
        });

        setProgress(70);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Upload failed (${res.status})`);
        }

        const result = await res.json();
        if (typeof result?.contentType === "string") {
          setUploadedType(result.contentType);
        }
        if (typeof result?.uploadedAt === "string") {
          setUploadedAt(result.uploadedAt);
        } else {
          setUploadedAt(new Date().toISOString());
        }
        setProgress(100);
        setStatus("complete");
        setQueueDone(false);
        toast.success("Image uploaded! Use it as a reference in the editor.");

        if (onUploadComplete) {
          onUploadComplete(result.imageUrl);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setError(msg);
        setStatus("error");
        toast.error(msg);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [projectId, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        const event = new Event("change", { bubbles: true });
        Object.defineProperty(event, "target", {
          value: fileInputRef.current,
          enumerable: true,
        });
        handleFileSelect(event as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-medium text-white mb-3">
        Upload Reference Image
      </h3>
      <p className="text-[11px] text-gray-500 mb-3">
        Upload a 2D floor plan image to use as a tracing reference in the editor.
      </p>

      {status === "idle" && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-500 transition cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-gray-400 text-xs mb-2">
            Drag & drop or click to upload
          </div>
          <div className="text-[11px] text-gray-500">
            JPG, PNG, WebP, or PDF (max 10MB)
          </div>
        </div>
      )}

      {(status === "uploading" || status === "processing") && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {status === "uploading" ? "Reading file..." : "Uploading..."}
          </div>
          {fileName && (
            <div className="text-[11px] text-gray-500 truncate">{fileName}</div>
          )}
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500">{progress}%</p>
        </div>
      )}

      {status === "complete" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Uploaded!
          </div>
          {fileName && (
            <div className="text-[11px] text-gray-500 truncate">{fileName}</div>
          )}
          {uploadedType && uploadedType !== "application/pdf" && (
            <div className="text-[11px] text-gray-500">Type: {uploadedType}</div>
          )}
          {uploadedType && uploadedType.startsWith("image/") && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-2">
              <div className="relative h-40 w-full">
                <Image
                  src={`/api/upload/${projectId}?v=${encodeURIComponent(uploadedAt ?? "")}`}
                  alt="Reference upload preview"
                  fill
                  unoptimized
                  className="rounded-md object-contain"
                />
              </div>
            </div>
          )}
          {uploadedAt && (
            <div className="text-[11px] text-gray-500">
              Uploaded: {new Date(uploadedAt).toLocaleString()}
            </div>
          )}
          {uploadedType === "application/pdf" && (
            <div className="text-[11px] text-amber-300">
              PDF uploaded. Preview and AI tracing are not supported yet.
            </div>
          )}
          {aiConfigured === false && (
            <div className="text-[11px] text-amber-300">
              AI service not configured. Set AI_SERVICE_URL to enable tracing.
            </div>
          )}
          {aiConfigured && aiUrl && (
            <div className="text-[11px] text-gray-500">
              AI service: {aiUrl}
            </div>
          )}
          {aiLoading && (
            <div className="text-[11px] text-gray-500">Checking AI service…</div>
          )}
          <button
            disabled={queueRunning || uploadedType === "application/pdf" || aiConfigured === false}
            onClick={async () => {
              setQueueRunning(true);
              try {
                const res = await fetch(`/api/convert/${projectId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "image", enqueueOnly: true }),
                });
                const data = await res.json().catch(() => ({})) as { error?: string; jobId?: string | null };
                if (!res.ok) {
                  throw new Error(data?.error || "Queue request failed");
                }
                toast.success("Image conversion queued.");
                setQueueDone(true);
                if (data?.jobId) {
                  toast.message(`Job queued: ${data.jobId.slice(0, 8)}`);
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Queue request failed";
                toast.error(msg);
              } finally {
                setQueueRunning(false);
              }
            }}
            className={[
              "w-full px-4 py-2 rounded-lg text-sm font-medium border transition",
              queueRunning || uploadedType === "application/pdf" || queueDone || aiConfigured === false
                ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                : "border-emerald-700/60 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/20",
            ].join(" ")}
            title="Queue image conversion (uses credits)"
          >
            {queueRunning ? "Queueing..." : queueDone ? "Queued" : "Queue Image Conversion"}
          </button>
          <button
            disabled={aiRunning || uploadedType === "application/pdf" || aiConfigured === false}
            onClick={async () => {
              setAiRunning(true);
              try {
                const res = await fetch(`/api/ai/convert/${projectId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: "image" }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  throw new Error(data?.error || "AI request failed");
                }
                toast.success("AI service responded (stub). Check console/network for payload.");
                // Keep the payload accessible for debugging.
                console.log("AI convert result", data);
              } catch (err) {
                const msg = err instanceof Error ? err.message : "AI request failed";
                toast.error(msg);
              } finally {
                setAiRunning(false);
              }
            }}
            className={[
              "w-full px-4 py-2 rounded-lg text-sm font-medium border transition",
              aiRunning || uploadedType === "application/pdf" || aiConfigured === false
                ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                : "border-blue-700/60 bg-blue-600/15 text-blue-200 hover:bg-blue-600/20",
            ].join(" ")}
            title="Phase 3 stub: calls AI microservice with the uploaded image"
          >
            {aiRunning ? "Calling AI..." : "Run AI Trace (stub)"}
          </button>
          <button
            onClick={() => {
              setStatus("idle");
              setFileName(null);
              setUploadedType(null);
              setUploadedAt(null);
            }}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
          >
            Upload Another
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="text-xs text-red-400">{error}</div>
          <button
            onClick={() => {
              setStatus("idle");
              setFileName(null);
              setUploadedType(null);
              setUploadedAt(null);
            }}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
