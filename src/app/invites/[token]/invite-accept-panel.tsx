"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function InviteAcceptPanel({ token }: { token: string }) {
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const accept = async () => {
      try {
        const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          projectId?: string;
        };
        if (!res.ok) throw new Error(data?.error || "Failed to accept invite");
        if (!cancelled) {
          setStatus("done");
          if (data.projectId) {
            router.replace(`/view/${data.projectId}`);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Failed to accept invite");
        }
      }
    };
    accept();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/70 p-6 text-center">
        {status === "loading" && (
          <>
            <div className="text-lg font-medium text-white">Accepting invite…</div>
            <p className="mt-2 text-sm text-gray-400">
              Hang tight while we connect you to the project.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-lg font-medium text-white">Invite failed</div>
            <p className="mt-2 text-sm text-gray-400">{error ?? "Please try again."}</p>
          </>
        )}
        {status === "done" && (
          <>
            <div className="text-lg font-medium text-white">Invite accepted</div>
            <p className="mt-2 text-sm text-gray-400">Redirecting you now.</p>
          </>
        )}
      </div>
    </div>
  );
}
