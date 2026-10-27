import { useMemo, useState } from "react";

type SearchTerm = {
  include: boolean;
  field: string | null;
  raw: string;
  comparator?: "eq" | "gt" | "lt" | "gte" | "lte";
  numberValue?: number;
};

export function parseSearchTerms(query: string): SearchTerm[] {
  const text = query.trim();
  if (!text) return [];

  const clauses: SearchTerm[] = [];

  for (const segment of text.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const hasPrefix = trimmed.startsWith("+") || trimmed.startsWith("-");
    const prefix = hasPrefix ? trimmed[0] : "";
    const body = hasPrefix ? trimmed.slice(1).trim() : trimmed.trim();
    if (!body) continue;

    const fieldMatch = body.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
    if (fieldMatch) {
      const field = fieldMatch[1].trim().toLowerCase();
      const value = fieldMatch[2].trim();
      const numericMatch = value.match(/^(>=|<=|>|<|=)?\s*(\d+)\s*$/);

      if (["price", "amount"].includes(field) && numericMatch) {
        const op = numericMatch[1] || "=";
        const numberValue = Number(numericMatch[2]);
        const comparator =
          op === ">" ? "gt" : op === "<" ? "lt" : op === ">=" ? "gte" : op === "<=" ? "lte" : "eq";

        clauses.push({ include: prefix !== "-", field, raw: value, comparator, numberValue });
        continue;
      }

      clauses.push({ include: prefix !== "-", field, raw: value });
      continue;
    }

    const words = body.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      for (const word of words) clauses.push({ include: prefix !== "-", field: null, raw: word });
      continue;
    }

    clauses.push({ include: prefix !== "-", field: null, raw: body });
  }

  return clauses;
}

export function matchesSearchTerm<T>(
  item: T,
  term: SearchTerm,
  getFieldValue: (item: T, field: string) => string | number | null,
  getFallbackText: (item: T) => string,
): boolean {
  const normalize = (value: string | number | null | undefined) => String(value ?? "").trim().toLowerCase();

  if (term.field) {
    const fieldValue = getFieldValue(item, term.field);
    const valueText = normalize(fieldValue);

    if (term.comparator && typeof term.numberValue === "number") {
      const numericValue = typeof fieldValue === "number" ? fieldValue : Number(fieldValue ?? NaN);
      if (Number.isNaN(numericValue)) return false;

      switch (term.comparator) {
        case "eq":
          return numericValue === term.numberValue;
        case "gt":
          return numericValue > term.numberValue;
        case "lt":
          return numericValue < term.numberValue;
        case "gte":
          return numericValue >= term.numberValue;
        case "lte":
          return numericValue <= term.numberValue;
      }
    }

    return valueText.includes(normalize(term.raw));
  }

  return normalize(getFallbackText(item)).includes(normalize(term.raw));
}

export function matchesSearchQuery<T>(
  item: T,
  query: string,
  getFieldValue: (item: T, field: string) => string | number | null,
  getFallbackText: (item: T) => string,
): boolean {
  const terms = parseSearchTerms(query);
  if (!terms.length) return true;

  const positives = terms.filter((term) => term.include);
  const negatives = terms.filter((term) => !term.include);

  if (positives.length > 0) {
    const passed = positives.every((term) => matchesSearchTerm(item, term, getFieldValue, getFallbackText));
    if (!passed) return false;
  }

  if (negatives.some((term) => matchesSearchTerm(item, term, getFieldValue, getFallbackText))) {
    return false;
  }

  return true;
}

export function useSearch<T>(items: T[], matcher: (item: T, query: string) => boolean) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((item) => matcher(item, q));
  }, [items, matcher, query]);

  return { query, setQuery, filtered };
}
