import { describe, expect, it } from "vitest";
import { matchesSearchQuery, parseSearchQuery } from "./useSearch";

describe("parseSearchQuery", () => {
  it("parses implicit AND terms and quoted exact phrases", () => {
    const parsed = parseSearchQuery('swimsuit collar');
    expect(parsed.terms.map((term) => ({ raw: term.raw, field: term.field, include: term.include }))).toEqual([
      { raw: "swimsuit", field: null, include: true },
      { raw: "collar", field: null, include: true },
    ]);

    const exact = parseSearchQuery('"full color"');
    expect(exact.terms).toHaveLength(1);
    expect(exact.terms[0]).toMatchObject({ field: null, raw: "full color", include: true, exact: true });
  });

  it("supports namespace filters and exclusions", () => {
    expect(parseSearchQuery("female:elf").terms[0]).toMatchObject({ field: "female", raw: "elf", include: true });
    expect(parseSearchQuery("group:yellow").terms[0]).toMatchObject({ field: "group", raw: "yellow", include: true });
    expect(parseSearchQuery("-loli -male:elf").terms).toEqual([
      expect.objectContaining({ field: null, raw: "loli", include: false }),
      expect.objectContaining({ field: "male", raw: "elf", include: false }),
    ]);
    expect(parseSearchQuery('parody:"naruto" -tag:glasses').terms).toEqual([
      expect.objectContaining({ field: "parody", raw: "naruto", include: true }),
      expect.objectContaining({ field: "tag", raw: "glasses", include: false }),
    ]);
    expect(parseSearchQuery('big breasts language:english -"sole female"').terms).toEqual([
      expect.objectContaining({ field: null, raw: "big", include: true }),
      expect.objectContaining({ field: null, raw: "breasts", include: true }),
      expect.objectContaining({ field: "language", raw: "english", include: true }),
      expect.objectContaining({ field: null, raw: "sole female", include: false }),
    ]);
  });

  it("handles malformed queries without throwing", () => {
    expect(() => parseSearchQuery("   ")).not.toThrow();
    expect(() => parseSearchQuery('"unterminated')).not.toThrow();
    expect(() => parseSearchQuery("category:")).not.toThrow();
    expect(parseSearchQuery("category:").terms).toEqual([]);
  });
});

describe("matchesSearchQuery", () => {
  const item = {
    category: "Food",
    payee: "Amazon",
    family: "Alice",
    mode: "Card",
    type: "debit",
    rawText: "Groceries - monthly shopping",
    amount: 125,
  };

  it("matches app-relevant namespace and exact text filters.", () => {
    expect(
      matchesSearchQuery(
        item,
        'category:food payee:amazon -"weekly shopping"',
        (entry, field) => {
          switch (field) {
            case "category":
              return entry.category;
            case "payee":
              return entry.payee;
            case "family":
              return entry.family;
            case "mode":
              return entry.mode;
            case "type":
              return entry.type;
            default:
              return `${entry.category} ${entry.payee} ${entry.family} ${entry.mode} ${entry.type} ${entry.rawText}`;
          }
        },
        (entry) => `${entry.category} ${entry.payee} ${entry.family} ${entry.mode} ${entry.type} ${entry.rawText}`,
      ),
    ).toBe(true);

    expect(
      matchesSearchQuery(
        item,
        'type:debit family:alice mode:card',
        (entry, field) => {
          switch (field) {
            case "type":
              return entry.type;
            case "family":
              return entry.family;
            case "mode":
              return entry.mode;
            default:
              return `${entry.category} ${entry.payee} ${entry.family} ${entry.mode} ${entry.type}`;
          }
        },
        (entry) => `${entry.category} ${entry.payee} ${entry.family} ${entry.mode} ${entry.type}`,
      ),
    ).toBe(true);
  });
});
