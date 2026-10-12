// Supabase Edge Function (Deno). Assigns a transaction description to one of the user's categories.
//
//   POST { "action": "sync" }            -> embeds any categories that have no vector yet
//   POST { "text": "Swiggy order 450" }  -> returns the best category
//
// How a match is made:
//   1. Embed the text with Supabase's built-in `gte-small` model (free, no API key).
//   2. Ask Postgres (pgvector, `match_categories`) for the nearest categories.
//   3. If the top hit is a clear winner, return it. No LLM call.
//   4. Otherwise give Groq only the shortlist and let it pick (or suggest a new category).

import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1";
const MAX_TEXT_CHARS = 500;
const SYNC_BATCH = 100;
const SHORTLIST_SIZE = 5;

// Skip the LLM when the best match is at least this similar AND beats the runner-up by MARGIN.
// gte-small scores run high (unrelated text is often ~0.75-0.8), so keep this strict. Tune by testing.
const DIRECT_THRESHOLD = Number(Deno.env.get("CATEGORIZE_DIRECT_THRESHOLD") ?? "0.92");
const DIRECT_MARGIN = Number(Deno.env.get("CATEGORIZE_DIRECT_MARGIN") ?? "0.03");

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

// deno-lint-ignore no-explicit-any
const embedder = new (globalThis as any).Supabase.ai.Session("gte-small");

async function embed(text: string): Promise<number[]> {
  const out = await embedder.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}

// pgvector accepts the text form "[0.1,0.2,...]", which is safe over PostgREST.
const toVector = (v: number[]) => JSON.stringify(v);

interface Match {
  id: string;
  name: string;
  similarity: number;
}

const SYSTEM_PROMPT = `You assign a personal-budget transaction description to a spending category.
You get the description and a shortlist of the user's existing categories (best vector matches first).
Rules:
- Return ONLY JSON: {"category": "<exact name from the list or null>", "suggestion": "<new category name or null>"}
- Pick from the list only if it is a genuinely good fit. Copy the name exactly as written.
- If nothing fits, set "category" to null and give a short "suggestion" (1-3 words, Title case). Brand/store names are valid suggestions and keep their capitalisation (e.g. "Swiggy", "Uber").
- If you pick a category, "suggestion" must be null.
- Never include explanations.`;

async function pickWithLlm(
  text: string,
  candidates: Match[],
  apiKey: string,
): Promise<{ category: string | null; suggestion: string | null }> {
  const list = candidates.length ? candidates.map((c) => `- ${c.name}`).join("\n") : "(none yet)";
  const res = await fetch(`${GROQ_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_CHAT_MODEL") ?? "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Description: ${text}\n\nCategories:\n${list}` },
      ],
    }),
  });
  if (!res.ok) {
    console.error("Groq chat error", res.status, await res.text());
    throw new Error(`AI request failed (${res.status})`);
  }
  const data = await res.json();
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    return {
      category: typeof parsed.category === "string" ? parsed.category : null,
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion.trim().slice(0, 40) || null : null,
    };
  } catch {
    return { category: null, suggestion: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in first" }, 401);

  // This client carries the caller's JWT, so row-level security limits everything to their own rows.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Session expired. Please sign in again." }, 401);

  try {
    const body = await req.json().catch(() => ({}));

    // ---- sync: embed categories that are missing a vector ----
    if (body?.action === "sync") {
      const { data: rows, error } = await supabase
        .from("categories")
        .select("id,name")
        .is("embedding", null)
        .limit(SYNC_BATCH);
      if (error) throw new Error(error.message);

      let synced = 0;
      for (const row of rows ?? []) {
        const vector = await embed(row.name);
        const { error: upErr } = await supabase
          .from("categories")
          .update({ embedding: toVector(vector) })
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        synced++;
      }
      return json({ synced, more: (rows?.length ?? 0) === SYNC_BATCH });
    }

    // ---- categorize ----
    const text = String(body?.text ?? "").trim().slice(0, MAX_TEXT_CHARS);
    if (!text) return json({ error: "No text provided" }, 400);

    const { data: matches, error: matchErr } = await supabase.rpc("match_categories", {
      query_embedding: toVector(await embed(text)),
      match_count: SHORTLIST_SIZE,
    });
    if (matchErr) throw new Error(matchErr.message);
    const candidates = (matches ?? []) as Match[];

    const [top, second] = candidates;
    if (top && top.similarity >= DIRECT_THRESHOLD && (!second || top.similarity - second.similarity >= DIRECT_MARGIN)) {
      return json({ source: "vector", category: top, suggestion: null, candidates });
    }

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      // No LLM available and no clear winner: return the shortlist so the app can ask the user.
      return json({ source: "vector-low", category: null, suggestion: null, candidates });
    }

    const pick = await pickWithLlm(text, candidates, apiKey);
    const chosen = pick.category
      ? candidates.find((c) => c.name.trim().toLowerCase() === pick.category!.trim().toLowerCase()) ?? null
      : null;
    return json({
      source: "llm",
      category: chosen,
      // Only suggest a new name when the model didn't pick an existing category.
      suggestion: chosen ? null : pick.suggestion,
      candidates,
    });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Something went wrong" }, 500);
  }
});
