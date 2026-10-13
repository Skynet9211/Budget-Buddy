import { supabase } from "./supabase";

export interface CategoryMatch {
  id: string;
  name: string;
  /** Cosine similarity, 0..1 (higher is closer). */
  similarity: number;
}

export interface CategorizeResult {
  /**
   * "history" = the user's own similar past transactions agreed (no AI call),
   * "vector" = a category name was a near-exact match (no AI call),
   * "llm" = AI chose from the shortlist, "vector-low" = no clear answer.
   */
  source: "history" | "vector" | "llm" | "vector-low";
  /** The existing category this belongs to, if one fits. */
  category: CategoryMatch | null;
  /** A new category name worth creating when no existing one fits. */
  suggestion: string | null;
  /** The nearest categories, best first. Useful for a "did you mean" picker. */
  candidates: CategoryMatch[];
}

/** Safety cap on back-to-back sync calls (each call embeds up to 100 rows). */
const MAX_SYNC_ROUNDS = 10;

/**
 * Embed anything that doesn't have a vector yet: categories (new, renamed or older rows) and past
 * transactions. Keeps going while the server says more remain. Returns how many rows were embedded.
 */
export async function syncCategoryEmbeddings(): Promise<number> {
  let total = 0;
  for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
    const { data, error } = await supabase.functions.invoke("categorize", { body: { action: "sync" } });
    if (error) throw new Error(error.message);
    const done = (Number(data?.synced) || 0) + (Number(data?.syncedTransactions) || 0);
    total += done;
    if (!data?.more || done === 0) break;
  }
  return total;
}

/**
 * Find the best category for a transaction, e.g. "Swiggy order 450". Passing the `party` (shop or
 * person) and `type` lets it match against the user's own history of similar transactions.
 */
export async function categorizeText(
  text: string,
  opts: { party?: string | null; type?: "debit" | "credit" } = {},
): Promise<CategorizeResult> {
  const { data, error } = await supabase.functions.invoke("categorize", {
    body: { text, party: opts.party ?? undefined, type: opts.type },
  });
  if (error) throw new Error(error.message);
  return {
    source: data?.source ?? "vector-low",
    category: data?.category ?? null,
    suggestion: typeof data?.suggestion === "string" ? data.suggestion : null,
    candidates: Array.isArray(data?.candidates) ? data.candidates : [],
  };
}
