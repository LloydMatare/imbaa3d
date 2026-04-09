"use client";

import { useState } from "react";
import { toast } from "sonner";

export function CopyShareLinkButton({
  projectId,
  isPublic,
  isOwner,
  token,
}: {
  projectId: string;
  isPublic: boolean;
  isOwner: boolean;
  token?: string;
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

    const url =
      isPublic || !shareToken
        ? `${origin}/view/${projectId}`
        : `${origin}/view/${projectId}?token=${encodeURIComponent(shareToken)}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Share link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
      title={isPublic ? "Copy public view link" : "Copy private share link"}
    >
      {copied ? "Copied!" : "Share"}
    </button>
  );
}
