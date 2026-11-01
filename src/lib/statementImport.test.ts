import { describe, expect, it } from "vitest";
import { chunkLines, findDuplicates, findHeaderLine } from "./statementImport";

const HEADER = "Date    Narration    Chq/Ref No    Withdrawal Amt    Deposit Amt    Closing Balance";
const row = (i: number) => `${String((i % 28) + 1).padStart(2, "0")}/09/26    UPI/41234567${i}/SWIGGY/Payment    ${i}    350.00        12,450.00`;

describe("findHeaderLine", () => {
  it("finds the column header of a statement table", () => {
    expect(findHeaderLine(["HDFC BANK", "Statement of account", HEADER, row(1)])).toBe(HEADER);
  });

  it("ignores lines that only mention a date", () => {
    expect(findHeaderLine(["Statement date: 01/10/2026", row(1)])).toBeNull();
  });
});

describe("chunkLines", () => {
  it("returns nothing for blank text", () => {
    expect(chunkLines("  \n\n ")).toEqual([]);
  });

  it("keeps a short statement in one chunk and drops blank lines", () => {
    const text = `${HEADER}\n\n${row(1)}\n${row(2)}\n`;
    expect(chunkLines(text)).toEqual([`${HEADER}\n${row(1)}\n${row(2)}`]);
  });

  it("splits only between lines, stays under the limit and repeats the header", () => {
    const lines = [HEADER, ...Array.from({ length: 80 }, (_, i) => row(i))];
    const chunks = chunkLines(lines.join("\n"), 1000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000);
      expect(c.split("\n")[0]).toBe(HEADER);
    }
    // Every row appears exactly once, in order.
    const body = chunks.flatMap((c) => c.split("\n").slice(1));
    expect(body).toEqual(lines.slice(1));
  });

  it("cuts a single over-long line into parts", () => {
    const long = "x".repeat(2500);
    const chunks = chunkLines(long, 1000);
    expect(chunks.join("")).toBe(long);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
  });
});

describe("findDuplicates", () => {
  const existing = [
    { date: "2026-09-05", type: "debit" as const, amount: 350 },
    { date: "2026-09-06", type: "credit" as const, amount: 25000 },
  ];

  it("flags rows that match on date, direction and amount", () => {
    expect(
      findDuplicates(
        [
          { date: "2026-09-05", type: "debit", amount: 350 },
          { date: "2026-09-05", type: "credit", amount: 350 },
          { date: "2026-09-06", type: "credit", amount: 25000.0 },
          { date: "2026-09-07", type: "debit", amount: 350 },
        ],
        existing,
      ),
    ).toEqual([true, false, true, false]);
  });

  it("matches one-to-one, so a second identical row is not flagged", () => {
    expect(
      findDuplicates(
        [
          { date: "2026-09-05", type: "debit", amount: 350 },
          { date: "2026-09-05", type: "debit", amount: 350 },
        ],
        existing,
      ),
    ).toEqual([true, false]);
  });
});
