// Supabase Edge Function (Deno). Assigns a transaction to one of the user's categories.
//
//   POST { "action": "sync" }                          -> embeds categories AND past transactions that have no vector yet
//   POST { "text": "Swiggy order 450", "party": "Swiggy", "type": "debit" }
//                                                      -> returns the best category
//
// Tiers (each runs only if the one before it wasn't sure; see _shared/vectors.ts):
//   1. HISTORY - the user's own similar past transactions vote on the category. No LLM call.
//   2. NAME    - nearest category names (pgvector). No LLM call.
//   3. LLM     - Groq, with Gemini fallback, gets the shortlist and similar past transactions.

import { createClient } from "npm:@supabase/supabase-js@2";
import { chatWithFallback } from "../_shared/ai.ts";
import {
  type CategoryRef,
  type Neighbour,
  resolveByVectors,
  syncCategories,
  syncTransactions,
} from "../_shared/vectors.ts";

const MAX_TEXT_CHARS = 500;
const MAX_EXAMPLES = 5;

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

const SYSTEM_PROMPT = `You assign a personal-budget transaction description to a spending category.
You get the description, a shortlist of the user's existing categories, and sometimes examples of how this user categorised similar past transactions (closest first). Follow the user's own habits shown in the examples.
Rules:
- Return ONLY JSON: {"category": "<exact name from the list or null>", "suggestion": "<new category name or null>"}
- Pick from the list only if it is a genuinely good fit. Copy the name exactly as written.
- If nothing fits, set "category" to null and give a short "suggestion" (1-3 words, Title case). Brand/store names are valid suggestions and keep their capitalisation (e.g. "Swiggy", "Uber").
- If you pick a category, "suggestion" must be null.
- Never include explanations.`;

async function pickWithLlm(
  text: string,
  candidates: CategoryRef[],
  examples: Neighbour[],
): Promise<{ category: string | null; suggestion: string | null }> {
  const list = candidates.length ? candidates.map((c) => "- " + c.name).join("\n") : "(none yet)";
  const shots = examples.length
    ? "\n\nSimilar past transactions by this user:\n" + examples.map((e) => "- " + (e.party || "(no name)") + " -> " + e.category_name).join("\n")
    : "";
  const content = await chatWithFallback(SYSTEM_PROMPT, "Description: " + text + "\n\nCategories:\n" + list + shots);
  try {
    const parsed = JSON.parse(content);
    let category: string | null = null;
    let suggestion: string | null = null;
    if (typeof parsed.category === "string") category = parsed.category;
    if (typeof parsed.suggestion === "string") suggestion = parsed.suggestion.trim().slice(0, 40) || null;
    return { category, suggestion };
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

    // ---- sync: embed categories and transactions that are missing a vector ----
    if (body?.action === "sync") {
      const cats = await syncCategories(supabase);
      const txns = await syncTransactions(supabase);
      return json({
        synced: cats.done, // categories (kept under this name for older clients)
        syncedTransactions: txns.done,
        more: cats.more || txns.more,
      });
    }

    // ---- categorize ----
    const text = String(body?.text ?? "").trim().slice(0, MAX_TEXT_CHARS);
    if (!text) return json({ error: "No text provided" }, 400);
    const party = typeof body?.party === "string" ? body.party.trim().slice(0, 60) : "";
    const type = body?.type === "credit" ? "credit" : body?.type === "debit" ? "debit" : null;

    // History is keyed on the party name (that's what gets embedded); fall back to the whole text.
    const found = await resolveByVectors(supabase, party || text, { type });

    if (found.source && found.category) {
      return json({
        source: found.source === "history" ? "history" : "vector",
        category: { ...found.category, similarity: found.neighbours[0]?.similarity ?? found.nameMatches[0]?.similarity ?? 0 },
        suggestion: null,
        confidence: found.confidence,
        candidates: found.nameMatches,
      });
    }

    // Shortlist for the LLM: the nearest category names, plus the categories this user has
    // actually used for similar transactions (deduplicated).
    const candidates: CategoryRef[] = [...found.nameMatches.map(({ id, name }) => ({ id, name }))];
    for (const n of found.neighbours) {
      if (!candidates.some((c) => c.id === n.category_id)) candidates.push({ id: n.category_id, name: n.category_name });
    }
    const examples = found.neighbours.slice(0, MAX_EXAMPLES);

    if (!Deno.env.get("GROQ_API_KEY") && !Deno.env.get("GEMINI_API_KEY")) {
      // No LLM available and no clear winner: return the shortlist so the app can ask the user.
      return json({ source: "vector-low", category: null, suggestion: null, candidates: found.nameMatches });
    }

    const pick = await pickWithLlm(text, candidates, examples);
    const chosen = pick.category
      ? candidates.find((c) => c.name.trim().toLowerCase() === pick.category!.trim().toLowerCase()) ?? null
      : null;
    return json({
      source: "llm",
      category: chosen
        ? { ...chosen, similarity: found.nameMatches.find((m) => m.id === chosen.id)?.similarity ?? 0 }
        : null,
      // Only suggest a new name when the model didn't pick an existing category.
      suggestion: chosen ? null : pick.suggestion,
      candidates: found.nameMatches,
    });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Something went wrong" }, 500);
  }
});
