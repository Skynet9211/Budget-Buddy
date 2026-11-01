import { describe, expect, it } from "vitest";
import { rowsFromItems, type PdfTextItem } from "./documentText";

/** A PDF text fragment at (x, y) in a 10pt font, 5pt per character. */
const item = (str: string, x: number, y: number): PdfTextItem => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width: str.length * 5,
  height: 10,
});

describe("rowsFromItems", () => {
  it("rebuilds rows top to bottom and keeps each value under its column, even after empty cells", () => {
    const rows = rowsFromItems([
      item("Date", 20, 720),
      item("Narration", 100, 720),
      item("Withdrawal", 300, 720),
      item("Deposit", 400, 720),
      // Deposit row stored before the withdrawal row and out of order, as PDFs often do.
      item("25,000.00", 400, 680),
      item("06/09/26", 20, 680),
      item("NEFT-RAMESH", 100, 680),
      item("05/09/26", 20, 700),
      item("UPI/SWIGGY", 100, 700),
      item("350.00", 300, 700.8), // slightly different baseline, same row
    ]);

    expect(rows.map((r) => r.trim().split(/\s+/)[0])).toEqual(["Date", "05/09/26", "06/09/26"]);
    const [header, withdrawal, deposit] = rows;
    expect(withdrawal.indexOf("350.00")).toBe(header.indexOf("Withdrawal"));
    expect(deposit.indexOf("25,000.00")).toBe(header.indexOf("Deposit"));
  });

  it("indents a wrapped narration line to its column", () => {
    const [, wrapped] = rowsFromItems([item("05/09/26", 20, 700), item("UPI/SWIGGY", 100, 700), item("/PAYMENT", 100, 690)]);
    expect(wrapped).toBe(`${" ".repeat(16)}/PAYMENT`);
  });

  it("joins fragments of one word without a gap and words with a space", () => {
    const rows = rowsFromItems([item("SWI", 100, 500), item("GGY", 115, 500), item("PAYMENT", 135, 500)]);
    expect(rows).toEqual(["SWIGGY PAYMENT"]);
  });
});
