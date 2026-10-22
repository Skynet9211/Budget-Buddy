import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Family, FamilyMember } from "../types";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // True after a password-reset code/link was verified, until the user picks a new password.
  const [recovery, setRecovery] = useState(false);
  const [families, setFamilies] = useState<Family[]>([]);
  const [memberships, setMemberships] = useState<FamilyMember[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  const loadFamilies = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setFamilies([]);
      setMemberships([]);
      setSelectedFamilyId(null);
      return;
    }

    const [{ data: memberRows }, { data: familyRows }] = await Promise.all([
      supabase.from("family_members").select("*, profile:users!user_id(email)").eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("families").select("*").order("created_at", { ascending: true }),
    ]);

    const members = (memberRows ?? []) as FamilyMember[];
    const allowed = (familyRows ?? []).filter((family) => {
      return family.owner_user_id === userId || members.some((m) => m.family_id === family.id);
    });

    setMemberships(members);
    setFamilies(allowed);
    setSelectedFamilyId((current) => current && allowed.some((family) => family.id === current) ? current : allowed[0]?.id ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      void loadFamilies(data.session?.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      void loadFamilies(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadFamilies]);

  const finishRecovery = useCallback(() => setRecovery(false), []);

  return {
    session,
    loading,
    recovery,
    finishRecovery,
    families,
    memberships,
    selectedFamilyId,
    setSelectedFamilyId,
    refreshFamilies: () => loadFamilies(session?.user.id),
  };
}
