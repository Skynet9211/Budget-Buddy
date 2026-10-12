import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isDuplicate, normalizeName } from "../lib/categories";
import { syncCategoryEmbeddings } from "../lib/categorize";

/** Keep category vectors up to date in the background. Never blocks or breaks the UI. */
function syncVectors() {
  syncCategoryEmbeddings().catch((e) => console.warn("Category vector sync skipped:", e));
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export function useCategories(userId: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else {
      setError(null);
      setCategories(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    syncVectors(); // backfills categories that existed before vector search was added
  }, [refresh, userId]);

  /** Adds several names; skips blanks and duplicates. Returns how many were added. */
  const addMany = useCallback(
    async (names: string[]): Promise<number> => {
      const existing = categories.map((c) => c.name);
      const toAdd: string[] = [];
      for (const raw of names) {
        const name = normalizeName(raw);
        if (!name || isDuplicate(name, [...existing, ...toAdd])) continue;
        toAdd.push(name);
      }
      if (!toAdd.length) return 0;
      const { error } = await supabase
        .from("categories")
        .insert(toAdd.map((name) => ({ name, user_id: userId })));
      if (error) {
        setError(error.message);
        return 0;
      }
      await refresh();
      syncVectors();
      return toAdd.length;
    },
    [categories, refresh, userId],
  );

  const rename = useCallback(
    async (id: string, raw: string): Promise<string | null> => {
      const name = normalizeName(raw);
      if (!name) return "Name can't be empty";
      if (isDuplicate(name, categories.filter((c) => c.id !== id).map((c) => c.name)))
        return "That category already exists";
      const { error } = await supabase.from("categories").update({ name }).eq("id", id);
      if (error) return error.message;
      await refresh();
      syncVectors(); // the DB clears the old vector on rename; re-embed the new name
      return null;
    },
    [categories, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) setError(error.message);
      else await refresh();
    },
    [refresh],
  );

  /** Reload the list, e.g. after saving a transaction that created a new category. */
  const reload = useCallback(async () => {
    await refresh();
    syncVectors();
  }, [refresh]);

  return { categories, loading, error, addMany, rename, remove, reload };
}
