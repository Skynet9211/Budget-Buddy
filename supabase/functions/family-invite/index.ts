import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FAMILY_INVITE_FROM");
  const appSiteUrl = Deno.env.get("APP_SITE_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !from || !appSiteUrl) {
    console.error("Family invite function is missing required secrets");
    return json({ error: "Family invitations are not configured yet." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json({ error: "Sign in to send an invitation." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user) return json({ error: "Your session has expired. Sign in again." }, 401);

  let payload: { familyId?: unknown; email?: unknown; redirectTo?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const familyId = typeof payload.familyId === "string" ? payload.familyId : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const redirectTo = typeof payload.redirectTo === "string" ? payload.redirectTo : "";
  if (!familyId || email.length > 254 || !emailPattern.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (user.email?.toLowerCase() === email) return json({ error: "You are already in this family." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: family, error: familyError } = await admin.from("families").select("id, name").eq("id", familyId).eq("owner_user_id", user.id).maybeSingle();
  if (familyError || !family) return json({ error: "Only the family owner can invite members." }, 403);

  const { data: existingMembers, error: membersError } = await admin.from("family_members").select("user_id").eq("family_id", familyId);
  if (membersError) return json({ error: "Could not check current family members." }, 500);
  const memberAccounts = await Promise.all((existingMembers ?? []).map(({ user_id }) => admin.auth.admin.getUserById(user_id)));
  if (memberAccounts.some(({ error }) => error)) return json({ error: "Could not check current family members." }, 500);
  if (memberAccounts.some(({ data }) => data.user?.email?.toLowerCase() === email)) {
    return json({ error: "That person is already a family member." }, 409);
  }

  const { data: prior, error: priorError } = await admin.from("family_invitations").select("id, status").eq("family_id", familyId).ilike("email", email).maybeSingle();
  if (priorError) return json({ error: "Could not check existing invitations." }, 500);
  if (prior?.status === "accepted") return json({ error: "That person has already accepted this invitation." }, 409);

  let acceptUrl: URL;
  try {
    acceptUrl = new URL(redirectTo || "/family", appSiteUrl);
    if (acceptUrl.origin !== new URL(appSiteUrl).origin) return json({ error: "Invalid invitation redirect URL." }, 400);
    acceptUrl.pathname = "/family";
  } catch {
    return json({ error: "Invalid invitation link configuration." }, 400);
  }

  const write = prior
    ? await admin.from("family_invitations").update({ status: "pending", invited_by: user.id, updated_at: new Date().toISOString() }).eq("id", prior.id).select("id, token").single()
    : await admin.from("family_invitations").insert({ family_id: familyId, email, invited_by: user.id, status: "pending" }).select("id, token").single();
  if (write.error || !write.data) return json({ error: "Could not create the invitation." }, 500);

  acceptUrl.searchParams.set("invite", write.data.token);

  const familyName = String(family.name).replace(/[<>&"']/g, "");
  const safeUrl = acceptUrl.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Invitation to join ${familyName} on Budget Buddy`,
      html: `<p>You have been invited to join <strong>${familyName}</strong> on Budget Buddy.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#5b5bd6;color:#fff;text-decoration:none;border-radius:8px">Accept invitation</a></p><p>If you do not have a Budget Buddy account yet, create one with this email address, then open this invitation link again.</p>`,
    }),
  });
  if (!response.ok) {
    console.error("Invitation email delivery failed", response.status, await response.text());
    return json({ error: "The invitation was created, but the email could not be sent. Check the email service configuration and try again." }, 502);
  }

  return json({ success: true });
});
