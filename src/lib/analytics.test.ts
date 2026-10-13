import { describe, expect, it } from "vitest";
import type { Expense } from "../types";
import { categoryTotals, filterByRange, timeSeries, totalSpend } from "./analytics";
import { ALL_TIME_START, oneMonthAgo } from "./dates";

const e = (id: string, date: string, amount: number, categories: string[]): Expense => ({
  id,
  date,
  amount,
  description: id,
  categories,
});

const data: Expense[] = [
  e("a", "2026-09-01", 100, ["Food"]),
  e("b", "2026-09-02", 60, ["Food", "Entertainment"]),
  e("c", "2026-09-10", 40, []),
];

describe("totalSpend", () => {
  it("counts a multi-category expense once", () => {
    expect(totalSpend(data)).toBe(200);
  });
});

describe("categoryTotals", () => {
  it("split: category totals add up to the overall total", () => {
    const t = categoryTotals(data, "split");
    expect(Object.fromEntries(t.map((c) => [c.name, c.value]))).toEqual({
      Food: 130,
      Entertainment: 30,
      Uncategorized: 40,
    });
    expect(t.reduce((s, c) => s + c.value, 0)).toBe(200);
  });

  it("full: the whole amount counts in each category", () => {
    const t = categoryTotals(data, "full");
    expect(t.find((c) => c.name === "Food")?.value).toBe(160);
    expect(t.find((c) => c.name === "Entertainment")?.value).toBe(60);
  });

  it("sorts biggest first", () => {
    expect(categoryTotals(data, "split").map((c) => c.name)).toEqual(["Food", "Uncategorized", "Entertainment"]);
  });
});

describe("filterByRange", () => {
  it("is inclusive on both ends", () => {
    expect(filterByRange(data, "2026-09-02", "2026-09-10").map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("all time (from 2000-01-01) includes everything", () => {
    expect(filterByRange(data, ALL_TIME_START, "2026-12-31")).toHaveLength(3);
  });
});

describe("timeSeries", () => {
  it("monthly buckets sum per month and skip leading empty months for all time", () => {
    const s = timeSeries(
      [e("a", "2026-08-31", 10, []), e("b", "2026-09-01", 5, []), e("c", "2026-09-30", 7, [])],
      ALL_TIME_START,
      "2026-10-13",
      "monthly",
    );
    expect(s.map((b) => b.total)).toEqual([10, 12, 0]);
  });

  it("weekly buckets start on Monday and include empty weeks", () => {
    // 2026-09-02 is a Wednesday (week of Mon 31 Aug); 2026-09-14 is a Monday.
    const s = timeSeries(
      [e("a", "2026-09-02", 10, []), e("b", "2026-09-14", 5, [])],
      "2026-09-01",
      "2026-09-20",
      "weekly",
    );
    expect(s.map((b) => b.key)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
    expect(s.map((b) => b.total)).toEqual([10, 0, 5]);
  });

  it("returns nothing when there is no spending", () => {
    expect(timeSeries([], "2026-09-01", "2026-09-20", "weekly")).toEqual([]);
  });
});

describe("oneMonthAgo", () => {
  it("clamps to the end of shorter months", () => {
    expect(oneMonthAgo(new Date(2026, 2, 31)).getDate()).toBe(28); // 31 Mar -> 28 Feb 2026
  });
});
