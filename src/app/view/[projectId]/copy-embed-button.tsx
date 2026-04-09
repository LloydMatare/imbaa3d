"use client";

import { useState } from "react";
import { toast } from "sonner";

export function CopyEmbedButton({
  projectId,
  isPublic,
  isOwner,
  token,
  overrides,
}: {
  projectId: string;
  isPublic: boolean;
  isOwner: boolean;
  token?: string;
  overrides?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    let shareToken = token;

    if (!isPublic && !shareToken) {
      if (!isOwner) {
        toast.error("Missing share token");
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/share-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data?.error || "Failed to create share token");
        return;
      }
      const data = (await res.json().catch(() => null)) as { shareToken?: string } | null;
      if (!data?.shareToken) {
        toast.error("Failed to create share token");
        return;
      }
      shareToken = data.shareToken;
    }

    const base = overrides ?? "controls=false";
    const src =
      isPublic || !shareToken
        ? `${origin}/embed/${projectId}?${base}`
        : `${origin}/embed/${projectId}?${base}&token=${encodeURIComponent(shareToken)}`;

    const code = `<iframe src="${src}" width="100%" height="500" frameborder="0" allowfullscreen></iframe>`;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Embed code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
      title="Copy iframe embed code"
    >
      {copied ? "Copied!" : "Embed"}
    </button>
  );
}
