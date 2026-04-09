"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Member = {
  id: string;
  userId: string;
  role: string;
  email: string;
  name: string | null;
  image: string | null;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
};

type Owner = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export function CollaboratorsPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");

  const inviteLink = useMemo(() => {
    const invite = invites.find((i) => i.status === "pending");
    if (!invite) return null;
    return `${window.location.origin}/invites/${invite.token}`;
  }, [invites]);

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied");
    } catch {
      toast.error("Failed to copy invite link");
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/members`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMembers(Array.isArray(data.members) ? data.members : []);
        setInvites(Array.isArray(data.invites) ? data.invites : []);
        setOwner(data.owner ?? null);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load collaborators");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to invite");
      setEmail("");
      setRole("viewer");
      toast.success("Invite sent");
      setOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setLoading(false);
      if (open) {
        const res = await fetch(`/api/projects/${projectId}/members`);
        const data = await res.json().catch(() => ({}));
        setMembers(Array.isArray(data.members) ? data.members : []);
        setInvites(Array.isArray(data.invites) ? data.invites : []);
        setOwner(data.owner ?? null);
      }
    }
  };

  const removeMember = async (memberId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/members/${memberId}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoading(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/invites/${inviteId}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to revoke invite");
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details
      className="relative"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="list-none px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition cursor-pointer">
        Collaborators
      </summary>
      <div className="absolute right-0 mt-2 w-80 rounded-xl border border-gray-800 bg-gray-950 shadow-xl z-50 p-3 space-y-3">
        <div className="text-xs font-medium text-white">Invite by email</div>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="flex-1 rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-100"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
            className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-100"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </div>
        <button
          onClick={handleInvite}
          disabled={loading || !email.trim()}
          className="w-full rounded-md border border-emerald-700/60 bg-emerald-600/15 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
        >
          Invite
        </button>
        {inviteLink && (
          <button
            onClick={() => void copyInviteLink()}
            className="w-full rounded-md border border-gray-800 bg-gray-900 py-1.5 text-xs text-gray-200 hover:bg-gray-800 transition"
          >
            Copy latest invite link
          </button>
        )}

        {owner && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
              Owner
            </div>
            <div className="text-xs text-gray-200">{owner.name || owner.email}</div>
          </div>
        )}

        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
            Members
          </div>
          {members.length === 0 && (
            <div className="text-xs text-gray-500">No collaborators yet.</div>
          )}
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between text-xs text-gray-200 py-1"
            >
              <div>
                <div>{member.name || member.email}</div>
                <div className="text-[10px] text-gray-500">{member.role}</div>
              </div>
              <button
                onClick={() => removeMember(member.id)}
                disabled={loading}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
            Pending invites
          </div>
          {invites.length === 0 && (
            <div className="text-xs text-gray-500">No pending invites.</div>
          )}
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between text-xs text-gray-200 py-1"
            >
              <div>
                <div>{invite.email}</div>
                <div className="text-[10px] text-gray-500">{invite.role}</div>
              </div>
              <button
                onClick={() => revokeInvite(invite.id)}
                disabled={loading}
                className="text-[10px] text-red-300 hover:text-red-200"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
