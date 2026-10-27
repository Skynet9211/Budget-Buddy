import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Message } from "@/components/ui/message";
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
    <Card className="flex flex-col gap-4">
      <h2 className="mb-0">Family</h2>
      {message && <Message kind={message.kind} className="mt-0">{message.text}</Message>}

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="mt-0 mb-0">Create a family</h3>
        <form onSubmit={createFamily} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Field label="Family name" className="flex-1">
            <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Family name" disabled={busy} />
          </Field>
          <Button disabled={busy || !familyName.trim()}>Create</Button>
        </form>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="mt-0 mb-0">Family members</h3>
        {currentFamily ? (
          <ul className="flex list-none flex-col gap-1 p-0 text-[0.9rem] wrap-anywhere">
            {members.length === 0 && <li className="text-muted-foreground">No family members yet.</li>}
            {members.map((member) => (
              <li key={member.id}>
                {member.user_id === currentFamily.owner_user_id ? "Owner" : "Member"} · {member.user_id}
              </li>
            ))}
          </ul>
        ) : (
          <Message>Create or select a family to manage members.</Message>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="mt-0 mb-0">Invite by email</h3>
        <form onSubmit={inviteMember} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Field label="Email address" className="flex-1">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              disabled={busy || !selectedFamilyId}
            />
          </Field>
          <Button variant="outline" disabled={busy || !selectedFamilyId || !inviteEmail.trim()}>
            Send invite
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="mt-0 mb-0">Pending invites</h3>
        {invitations.length === 0 ? (
          <Message>No invites yet.</Message>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0 text-[0.9rem] wrap-anywhere">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                {invitation.email} · {invitation.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      {invitations.some((inv) => inv.email.toLowerCase() === email.toLowerCase() && inv.status === "pending") && (
        <Button onClick={() => void acceptOwnInvite()}>Accept invite to this family</Button>
      )}
    </Card>
  );
}
