import { supabase } from "./supabase";

export interface CategoryMatch {
  id: string;
  name: string;
  /** Cosine similarity, 0..1 (higher is closer). */
  similarity: number;
}

export interface CategorizeResult {
  /** "vector" = confident vector match, "llm" = AI chose from the shortlist, "vector-low" = no clear answer. */
  source: "vector" | "llm" | "vector-low";
  /** The existing category this belongs to, if one fits. */
  category: CategoryMatch | null;
  /** A new category name worth creating when no existing one fits. */
  suggestion: string | null;
  /** The nearest categories, best first. Useful for a "did you mean" picker. */
  candidates: CategoryMatch[];
}

/** Embed any categories that don't have a vector yet (new ones, renamed ones, or older rows). */
export async function syncCategoryEmbeddings(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("categorize", { body: { action: "sync" } });
  if (error) throw new Error(error.message);
  return typeof data?.synced === "number" ? data.synced : 0;
}

/** Find the best category for a transaction description, e.g. "Swiggy order 450". */
export async function categorizeText(text: string): Promise<CategorizeResult> {
  const { data, error } = await supabase.functions.invoke("categorize", { body: { text } });
  if (error) throw new Error(error.message);
  return {
    source: data?.source ?? "vector-low",
    category: data?.category ?? null,
    suggestion: typeof data?.suggestion === "string" ? data.suggestion : null,
    candidates: Array.isArray(data?.candidates) ? data.candidates : [],
  };
}
