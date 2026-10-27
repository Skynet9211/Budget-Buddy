import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [familyName, setFamilyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "info" | "success" } | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);

  const currentFamily = families.find((family) => family.id === selectedFamilyId) ?? null;
  const canInvite = currentFamily?.owner_user_id === userId;

  useEffect(() => {
    if (!selectedFamilyId) {
      setMembers([]);
      setInvitations([]);
      return;
    }

    async function loadFamilyData() {
      const [{ data: memberData }, { data: inviteData }] = await Promise.all([
        supabase.from("family_members").select("*").eq("family_id", selectedFamilyId),
        supabase.from("family_invitations").select("*").eq("family_id", selectedFamilyId).order("created_at", { ascending: false }),
      ]);
      setMembers((memberData ?? []) as FamilyMember[]);
      setInvitations((inviteData ?? []) as FamilyInvitation[]);
    }

    void loadFamilyData();
  }, [selectedFamilyId]);

  useEffect(() => {
    const token = searchParams.get("invite");
    if (!token) return;
    let active = true;
    setBusy(true);
    setMessage(null);
    void supabase.rpc("accept_family_invitation", { p_token: token })
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          setMessage({
            text: `${error.message} Sign in with the email address that received this invitation; the invitation link is still available to retry.`,
            kind: "error",
          });
        } else {
          setMessage({ text: "Invitation accepted. You joined the family.", kind: "success" });
          if (typeof data === "string") setSelectedFamilyId(data);
          await onRefreshFamilies();
          setSearchParams((params) => {
            params.delete("invite");
            return params;
          }, { replace: true });
        }
        setBusy(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage({
          text: `${error instanceof Error ? error.message : "Could not accept this invitation."} The invitation link is still available to retry.`,
          kind: "error",
        });
        setBusy(false);
      });
    return () => { active = false; };
  }, [searchParams, setSearchParams, onRefreshFamilies, setSelectedFamilyId]);

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
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!selectedFamilyId || !normalizedEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage({ text: "Enter a valid email address.", kind: "error" });
      return;
    }
    if (normalizedEmail === email.trim().toLowerCase()) {
      setMessage({ text: "You are already in this family.", kind: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);

    let error;
    try {
      ({ error } = await supabase.functions.invoke("family-invite", {
        body: {
          familyId: selectedFamilyId,
          email: normalizedEmail,
          redirectTo: `${window.location.origin}/family`,
        },
      }));
    } catch (reason) {
      setMessage({
        text: reason instanceof Error ? reason.message : "Could not send the invitation. Check your connection and try again.",
        kind: "error",
      });
      setBusy(false);
      return;
    }

    if (error) {
      let text = error.message;
      if (error.context instanceof Response) {
        try {
          const body = await error.context.clone().json();
          if (typeof body.error === "string") text = body.error;
        } catch {
          // Keep the function error message when the response has no JSON error body.
        }
      }
      setMessage({ text, kind: "error" });
      setBusy(false);
      return;
    }

    setInviteEmail("");
    setBusy(false);
    setMessage({ text: `Invitation email sent to ${normalizedEmail}.`, kind: "success" });
    await onRefreshFamilies();
    if (selectedFamilyId) {
      const { data } = await supabase.from("family_invitations").select("*").eq("family_id", selectedFamilyId).order("created_at", { ascending: false });
      setInvitations((data ?? []) as FamilyInvitation[]);
    }
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
                  {member.user_id === currentFamily.owner_user_id ? "Owner" : "Member"} · {member.user_id === userId ? email : member.user_id}
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
                disabled={busy || !canInvite}
              />
            </label>
            <button className="btn" disabled={busy || !canInvite || !inviteEmail.trim()}>
              Send invite
            </button>
          </form>
          {currentFamily && !canInvite && <p className="hint">Only the family owner can invite members.</p>}
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

    </section>
  );
}
