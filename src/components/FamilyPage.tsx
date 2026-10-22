import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Family, FamilyInvitation, FamilyMember } from "../types";

interface FamilyPageProps {
  userId: string;
  email: string;
  families: Family[];
  selectedFamilyId: string | null;
  setSelectedFamilyId: (familyId: string | null) => void;
  onRefreshFamilies: () => Promise<void> | void;
}

export default function FamilyPage({ userId, email, families, selectedFamilyId, setSelectedFamilyId, onRefreshFamilies }: FamilyPageProps) {
  const [familyName, setFamilyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "info" | "success" } | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);

  const currentFamily = families.find((family) => family.id === selectedFamilyId) ?? null;

  useEffect(() => {
    if (!selectedFamilyId) {
      setMembers([]);
      setInvitations([]);
      return;
    }

    async function loadFamilyData() {
      const [{ data: memberData }, { data: inviteData }] = await Promise.all([
        supabase.from("family_members").select("*, user:users!user_id(email)").eq("family_id", selectedFamilyId),
        supabase.from("family_invitations").select("*").eq("family_id", selectedFamilyId).order("created_at", { ascending: false }),
      ]);
      setMembers((memberData ?? []) as FamilyMember[]);
      setInvitations((inviteData ?? []) as FamilyInvitation[]);
    }

    void loadFamilyData();
  }, [selectedFamilyId]);

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!familyName.trim()) return;
    setBusy(true);
    setMessage(null);

    const { data, error } = await supabase.from("families").insert({ name: familyName.trim(), owner_user_id: userId }).select().single();

    if (error) {
      setMessage({ text: error.message, kind: "error" });
      setBusy(false);
      return;
    }

    const familyId = data.id;
    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: familyId,
      user_id: userId,
      role: "owner",
    });

    if (memberError) {
      setMessage({ text: memberError.message, kind: "error" });
      setBusy(false);
      return;
    }

    setSelectedFamilyId(familyId);
    setFamilyName("");
    setBusy(false);
    setMessage({ text: "Family created.", kind: "success" });
    await onRefreshFamilies();
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFamilyId || !inviteEmail.trim()) return;
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.from("family_invitations").insert({
      family_id: selectedFamilyId,
      email: inviteEmail.trim(),
      invited_by: userId,
      status: "pending",
    });

    if (error) {
      setMessage({ text: error.message, kind: "error" });
      setBusy(false);
      return;
    }

    setInviteEmail("");
    setBusy(false);
    setMessage({ text: "Invite sent.", kind: "success" });
    await onRefreshFamilies();
    if (selectedFamilyId) {
      const { data } = await supabase.from("family_invitations").select("*").eq("family_id", selectedFamilyId).order("created_at", { ascending: false });
      setInvitations((data ?? []) as FamilyInvitation[]);
    }
  }

  async function acceptOwnInvite() {
    const pending = invitations.find((inv) => inv.email.toLowerCase() === email.toLowerCase() && inv.status === "pending");
    if (!pending) return;
    const { error } = await supabase.from("family_invitations").update({ status: "accepted" }).eq("id", pending.id);
    if (error) {
      setMessage({ text: error.message, kind: "error" });
      return;
    }
    const { error: memberError } = await supabase.from("family_members").upsert(
      {
        family_id: pending.family_id,
        user_id: userId,
        role: "member",
      },
      { onConflict: "family_id,user_id" },
    );
    if (memberError) {
      setMessage({ text: memberError.message, kind: "error" });
      return;
    }
    setSelectedFamilyId(pending.family_id);
    setMessage({ text: "You joined the family.", kind: "success" });
    await onRefreshFamilies();
  }

  return (
    <section className="card">
      <h2>Family</h2>
      {message && <p className={message.kind === "error" ? "error" : message.kind === "success" ? "success" : "info"}>{message.text}</p>}

      <form onSubmit={createFamily} className="family-form">
        <label>
          Create a family
          <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Family name" disabled={busy} />
        </label>
        <button className="btn primary" disabled={busy || !familyName.trim()}>
          Create
        </button>
      </form>

      <div className="family-panel">
        <div>
          <h3>Family members</h3>
          {currentFamily ? (
            <ul className="plain-list">
              {members.length === 0 && <li>No family members yet.</li>}
              {members.map((member) => (
                <li key={member.id}>
                  {member.user_id === currentFamily.owner_user_id ? "Owner" : "Member"} · {member.user_id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Create or select a family to manage members.</p>
          )}
        </div>

        <div>
          <h3>Invite by email</h3>
          <form onSubmit={inviteMember} className="family-form">
            <label>
              Email address
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="friend@example.com"
                disabled={busy || !selectedFamilyId}
              />
            </label>
            <button className="btn" disabled={busy || !selectedFamilyId || !inviteEmail.trim()}>
              Send invite
            </button>
          </form>
        </div>
      </div>

      <div>
        <h3>Pending invites</h3>
        {invitations.length === 0 ? (
          <p className="hint">No invites yet.</p>
        ) : (
          <ul className="plain-list">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                {invitation.email} · {invitation.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      {invitations.some((inv) => inv.email.toLowerCase() === email.toLowerCase() && inv.status === "pending") && (
        <button className="btn primary" onClick={() => void acceptOwnInvite()}>
          Accept invite to this family
        </button>
      )}
    </section>
  );
}
