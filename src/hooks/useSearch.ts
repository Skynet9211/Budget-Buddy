import { useMemo, useState } from "react";

export function useSearch<T>(items: T[], matcher: (item: T, query: string) => boolean) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => matcher(item, q));
  }, [items, matcher, query]);

  return { query, setQuery, filtered };
}
