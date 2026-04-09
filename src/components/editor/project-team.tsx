"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

type Member = {
  id: string;
  userId: string;
  name?: string;
  email: string;
  role: string;
  isOwner: boolean;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

export function ProjectTeam({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const { user } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`);
      const data = await res.json() as { owner?: { id: string; email: string; name?: string }; members?: { id: string; email: string; name?: string; role: string }[]; invites?: { id: string; email: string; role: string; status: string; createdAt: string }[] };

      if (res.ok) {
        const { owner, members: projectMembers = [], invites = [] } = data;
        setMembers([
          { ...(owner || {}), isOwner: true, role: 'owner' },
          ...projectMembers.map((m: any) => ({ ...m, isOwner: false })),
        ]);
        setInvites(invites);
        setInvites(invites || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.invited === "member" ? "Added to team" : "Invite sent");
        loadData();
        setInviteEmail("");
      } else {
        toast.error(data.error || "Failed to invite");
      }
    } catch (err) {
      toast.error("Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Invite canceled");
        loadData();
      } else {
        toast.error("Failed to cancel invite");
      }
    } catch (err) {
      toast.error("Failed to cancel invite");
    }
  };

  if (loading) return <div>Loading team...</div>;

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">Project Team</h3>

      <div className="mb-6">
        <h4 className="font-medium mb-2">Members</h4>
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <div className="font-medium">{member.name || member.email}</div>
                <div className="text-sm text-gray-500">{member.email} • {member.isOwner ? "Owner" : member.role}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isOwner && (
        <div className="mb-6">
          <h4 className="font-medium mb-2">Invite New Member</h4>
          <div className="flex gap-2 mb-2">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 px-3 py-2 border rounded"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "viewer" | "editor")}
              className="px-3 py-2 border rounded"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {inviting ? "Inviting..." : "Invite"}
            </button>
          </div>
        </div>
      )}

      {isOwner && invites.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Pending Invites</h4>
          <ul className="space-y-2">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                <div>
                  <div className="font-medium">{invite.email}</div>
                  <div className="text-sm text-gray-500">{invite.role} • Invited {new Date(invite.createdAt).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={() => handleCancelInvite(invite.id)}
                  className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}