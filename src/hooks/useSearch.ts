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

export type SearchSuggestion = {
  value: string;
  label: string;
};

export function useSearchSuggestions(options: {
  query: string;
  categoryNames?: string[];
  paymentModes?: string[];
  payees?: string[];
  familyMembers?: string[];
  types?: string[];
  includeDefaultSuggestions?: boolean;
}) {
  const {
    query,
    categoryNames = [],
    paymentModes = [],
    payees = [],
    familyMembers = [],
    types = ["debit", "credit"],
    includeDefaultSuggestions = true,
  } = options;

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();
    const results: SearchSuggestion[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      if (!value) return;
      const normalized = value.trim();
      if (!normalized) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      results.push({ value: normalized, label: normalized });
    };

    if (!trimmed) {
      if (includeDefaultSuggestions) {
        [
          "category:food",
          "price:>100",
          "mode:card",
          "date:2024-09",
          "payee:amazon",
          "family:alice",
          "type:debit",
        ].forEach(push);
      }
      return results;
    }

    if (/^\d+$/.test(trimmed)) {
      push(`price:${trimmed}`);
      push(`price:>${trimmed}`);
      push(`price:<${trimmed}`);
      return results.slice(0, 5);
    }

    const fieldMatches = [
      ...categoryNames.filter((name) => name.toLowerCase().includes(lower)).map((name) => `category:${name}`),
      ...paymentModes.filter((name) => name.toLowerCase().includes(lower)).map((name) => `mode:${name}`),
      ...payees.filter((name) => name.toLowerCase().includes(lower)).map((name) => `payee:${name}`),
      ...familyMembers.filter((name) => name.toLowerCase().includes(lower)).map((name) => `family:${name}`),
      ...types.filter((type) => type.toLowerCase().includes(lower)).map((type) => `type:${type}`),
    ];

    fieldMatches.forEach(push);

    if (!trimmed.includes(":")) {
      push(`category:${trimmed}`);
      push(`price:${trimmed}`);
      push(`price:>${trimmed}`);
      push(`price:<${trimmed}`);
      push(`payee:${trimmed}`);
      push(`family:${trimmed}`);
      push(`mode:${trimmed}`);
      push(`type:${trimmed}`);
    }

    const month = new Date().getMonth() + 1;
    push(`date:${new Date().getFullYear()}-${String(month).padStart(2, "0")}`);

    return results.slice(0, 8);
  }, [categoryNames, familyMembers, includeDefaultSuggestions, paymentModes, payees, query, types]);

  const appendSuggestion = (currentQuery: string, suggestion: string) => {
    const next = currentQuery.trim();
    if (!next) return suggestion;
    if (next.endsWith(";")) return `${next} ${suggestion}`;
    return `${next}; ${suggestion}`;
  };

  return { suggestions, appendSuggestion };
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
