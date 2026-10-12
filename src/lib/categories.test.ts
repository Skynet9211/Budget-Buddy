import { describe, expect, it } from "vitest";
import { cleanSuggestions, emojiFor, isDuplicate, normalizeName, splitLocally } from "./categories";

describe("normalizeName", () => {
  it("trims, collapses spaces and capitalises", () => {
    expect(normalizeName("  eating   out ")).toBe("Eating out");
  });
  it("returns empty for blank", () => {
    expect(normalizeName("   ")).toBe("");
  });
  it("limits length", () => {
    expect(normalizeName("a".repeat(100)).length).toBe(40);
  });
});

describe("isDuplicate", () => {
  it("ignores case and spacing", () => {
    expect(isDuplicate(" groceries ", ["Groceries"])).toBe(true);
    expect(isDuplicate("rent", ["Groceries"])).toBe(false);
  });
});

describe("cleanSuggestions", () => {
  it("normalises, removes empties, non-strings and duplicates", () => {
    expect(cleanSuggestions(["groceries", "GROCERIES", "", 5, "eating out"])).toEqual([
      "Groceries",
      "Eating out",
    ]);
  });
  it("drops existing categories", () => {
    expect(cleanSuggestions(["rent", "fuel"], ["Rent"])).toEqual(["Fuel"]);
  });
  it("handles non-array input", () => {
    expect(cleanSuggestions(null)).toEqual([]);
  });
});

describe("splitLocally", () => {
  it("splits lists", () => {
    expect(splitLocally("add groceries, transport and rent")).toEqual(["Groceries", "Transport", "Rent"]);
  });
});

describe("emojiFor", () => {
  it("picks sensible emoji", () => {
    expect(emojiFor("Groceries")).toBe("🛒");
    expect(emojiFor("Petrol")).toBe("🚗");
    expect(emojiFor("Swiggy")).toBe("🍽️");
    expect(emojiFor("Amazon")).toBe("📦");
    expect(emojiFor("Zzz")).toBe("🏷️");
  });
});
