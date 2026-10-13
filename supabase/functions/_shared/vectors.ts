// Shared by the `categorize` and `parse-transaction` Edge Functions (Deno).
//
// Tiered categorisation. Each tier is tried only if the one before it wasn't sure:
//
//   1. HISTORY  - the user's own past transactions closest to this one (vector kNN), voted by
//                 similarity. "Swiggy" -> whatever Swiggy was filed under before. No LLM.
//   2. NAME     - the category names closest to the text (cold start, no usable history). No LLM.
//   3. LLM      - done by the caller, which is handed the shortlist plus worked examples.
//
// Embeddings come from Supabase's built-in `gte-small` model (free, no API key).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// ---- tunables (override with function secrets; see README) ----------------------------------
const num = (key: string, fallback: number) => {
  const n = Number(Deno.env.get(key));
  return Deno.env.get(key) !== undefined && Number.isFinite(n) ? n : fallback;
};

/** Tier 1: the closest past transaction must be at least this similar... */
export const HISTORY_MIN_SIM = () => num("CATEGORIZE_HISTORY_MIN_SIM", 0.92);
/** ...and the winning category must hold at least this share of the (weighted) votes. */
export const HISTORY_MIN_SHARE = () => num("CATEGORIZE_HISTORY_MIN_SHARE", 0.7);
/** Neighbours below this similarity are ignored entirely: they're noise, not evidence. */
const NEIGHBOUR_FLOOR = () => num("CATEGORIZE_NEIGHBOUR_FLOOR", 0.85);
/** Tier 2: best category-name match must be this similar AND beat the runner-up by the margin. */
export const NAME_MIN_SIM = () => num("CATEGORIZE_DIRECT_THRESHOLD", 0.92);
export const NAME_MARGIN = () => num("CATEGORIZE_DIRECT_MARGIN", 0.03);

const NEIGHBOURS = 15;
const SHORTLIST = 5;
const SYNC_BATCH = 100;

// ---- embeddings ------------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
const embedder = new (globalThis as any).Supabase.ai.Session("gte-small");

export async function embed(text: string): Promise<number[]> {
  const out = await embedder.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}

/** pgvector accepts the text form "[0.1,0.2,...]", which is safe over PostgREST. */
export const toVector = (v: number[]) => JSON.stringify(v);

// ---- types -----------------------------------------------------------------------------------
export interface CategoryRef {
  id: string;
  name: string;
}
export interface NameMatch extends CategoryRef {
  similarity: number;
}
export interface Neighbour {
  transaction_id: string;
  category_id: string;
  category_name: string;
  party: string | null;
  similarity: number;
}
export type VectorSource = "history" | "name";

export interface VectorResult {
  /** Which tier decided, or null when neither was sure (the LLM should take over). */
  source: VectorSource | null;
  category: CategoryRef | null;
  /** Share of the weighted votes the winner got (history tier only). */
  confidence: number | null;
  /** Nearest category names, best first. */
  nameMatches: NameMatch[];
  /** Nearest past transactions, best first. Use as few-shot examples for the LLM. */
  neighbours: Neighbour[];
}

// ---- tier 1: vote among the user's own past transactions -------------------------------------
/**
 * Each neighbour votes for its category with weight exp(20 * (sim - 1)): an identical text
 * counts 1.0, 0.95 counts ~0.37, 0.90 counts ~0.14. So a close match outweighs several loose ones,
 * and one stray mislabelled transaction can't drag the result away from a consistent history.
 */
export function voteOnHistory(neighbours: Neighbour[]): { category: CategoryRef; confidence: number } | null {
  const floor = NEIGHBOUR_FLOOR();
  const near = neighbours.filter((n) => n.similarity >= floor);
  if (!near.length) return null;

  const scores = new Map<string, { name: string; score: number }>();
  let total = 0;
  for (const n of near) {
    const w = Math.exp(20 * (n.similarity - 1));
    total += w;
    const cur = scores.get(n.category_id);
    if (cur) cur.score += w;
    else scores.set(n.category_id, { name: n.category_name, score: w });
  }

  let bestId = "";
  let best = { name: "", score: -1 };
  for (const [id, s] of scores) if (s.score > best.score) [bestId, best] = [id, s];

  const topSim = Math.max(...near.map((n) => n.similarity));
  const confidence = total > 0 ? best.score / total : 0;
  if (topSim < HISTORY_MIN_SIM() || confidence < HISTORY_MIN_SHARE()) return null;
  return { category: { id: bestId, name: best.name }, confidence };
}

// ---- tier 2: nearest category names ----------------------------------------------------------
export function pickByName(matches: NameMatch[]): NameMatch | null {
  const [top, second] = matches;
  if (!top || top.similarity < NAME_MIN_SIM()) return null;
  if (second && top.similarity - second.similarity < NAME_MARGIN()) return null;
  return top;
}

// ---- tiers 1 + 2 together --------------------------------------------------------------------
/**
 * Runs the vector tiers for one piece of text. Never calls an LLM.
 * `text` is what to embed (ideally the party name, e.g. "Swiggy"); `type` limits history to
 * debits or credits. Pass `useNames: false` to skip tier 2.
 */
export async function resolveByVectors(
  supabase: SupabaseClient,
  text: string,
  opts: { type?: "debit" | "credit" | null; useNames?: boolean } = {},
): Promise<VectorResult> {
  const query = toVector(await embed(text));

  const [hist, names] = await Promise.all([
    supabase.rpc("match_transactions", { query_embedding: query, p_type: opts.type ?? null, match_count: NEIGHBOURS }),
    supabase.rpc("match_categories", { query_embedding: query, match_count: SHORTLIST }),
  ]);
  // History is an optimisation: if migration 006 isn't applied yet, fall through to the next tier.
  if (hist.error) console.warn("match_transactions failed:", hist.error.message);
  if (names.error) throw new Error(names.error.message);

  const neighbours = (hist.data ?? []) as Neighbour[];
  const nameMatches = (names.data ?? []) as NameMatch[];

  const voted = voteOnHistory(neighbours);
  if (voted) return { source: "history", category: voted.category, confidence: voted.confidence, nameMatches, neighbours };

  if (opts.useNames !== false) {
    const byName = pickByName(nameMatches);
    if (byName) {
      return { source: "name", category: { id: byName.id, name: byName.name }, confidence: null, nameMatches, neighbours };
    }
  }
  return { source: null, category: null, confidence: null, nameMatches, neighbours };
}

// ---- keeping vectors current -----------------------------------------------------------------
/** Embeds categories that have no vector yet. Returns how many were done and whether more remain. */
export async function syncCategories(supabase: SupabaseClient): Promise<{ done: number; more: boolean }> {
  const { data: rows, error } = await supabase.from("categories").select("id,name").is("embedding", null).limit(SYNC_BATCH);
  if (error) throw new Error(error.message);

  let done = 0;
  for (const row of rows ?? []) {
    const { error: upErr } = await supabase
      .from("categories")
      .update({ embedding: toVector(await embed(row.name)) })
      .eq("id", row.id);
    if (upErr) throw new Error(upErr.message);
    done++;
  }
  return { done, more: (rows?.length ?? 0) === SYNC_BATCH };
}

/** Embeds transactions (by party name) that have no vector yet. Same texts are embedded once. */
export async function syncTransactions(supabase: SupabaseClient): Promise<{ done: number; more: boolean }> {
  const { data: rows, error } = await supabase.rpc("transactions_to_embed", { p_limit: SYNC_BATCH });
  if (error) {
    // Migration 006 not applied yet: nothing to do, and that must not break category syncing.
    console.warn("transactions_to_embed failed:", error.message);
    return { done: 0, more: false };
  }

  const cache = new Map<string, string>();
  let done = 0;
  for (const row of (rows ?? []) as { id: string; party: string }[]) {
    const key = row.party.trim().toLowerCase();
    let vec = cache.get(key);
    if (!vec) {
      vec = toVector(await embed(row.party.trim()));
      cache.set(key, vec);
    }
    const { error: upErr } = await supabase.from("transactions").update({ embedding: vec }).eq("id", row.id);
    if (upErr) throw new Error(upErr.message);
    done++;
  }
  return { done, more: (rows?.length ?? 0) === SYNC_BATCH };
}
