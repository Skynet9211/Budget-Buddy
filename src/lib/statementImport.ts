import type { TxnType } from "./transactions";

const HEADER_WORDS = /\b(narration|description|particulars|details|remarks|withdrawal|deposit|debit|credit|amount|balance)\b/i;
const DATE_WORD = /\bdate\b/i;
/** How far into the text to look for the table's column header. */
const HEADER_SEARCH_LINES = 60;

/** The statement's column header line (e.g. "Date  Narration  Withdrawal  Deposit  Balance"), if found. */
export function findHeaderLine(lines: string[]): string | null {
  for (const line of lines.slice(0, HEADER_SEARCH_LINES)) {
    const hits = line.match(new RegExp(HEADER_WORDS.source, "gi"))?.length ?? 0;
    if (DATE_WORD.test(line) && hits >= 2 && line.length < 300) return line.trimEnd();
  }
  return null;
}

/**
 * Splits statement text into pieces of at most `maxChars`, breaking only between lines. The
 * column header is repeated at the top of every piece after the first, so each one can be read on
 * its own. A single line longer than the limit is cut into parts.
 */
export function chunkLines(text: string, maxChars = 6000): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (!lines.length) return [];

  const header = findHeaderLine(lines);
  const prefix = header ? `${header}\n` : "";
  const room = Math.max(200, maxChars - prefix.length);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (!current) return;
    chunks.push(chunks.length && prefix && !current.startsWith(prefix) ? prefix + current : current);
    current = "";
  };

  for (const line of lines) {
    const parts: string[] = [];
    for (let i = 0; i < line.length; i += room) parts.push(line.slice(i, i + room));
    for (const part of parts) {
      if (current && current.length + part.length + 1 > room) flush();
      current = current ? `${current}\n${part}` : part;
    }
  }
  flush();
  return chunks;
}

export interface DuplicateKey {
  date: string;
  amount: number;
  type: TxnType;
}

export const duplicateKey = (k: DuplicateKey) => `${k.date}|${k.type}|${k.amount.toFixed(2)}`;

/**
 * For each imported row, whether it matches an existing transaction on date, type and amount.
 * Matching is one-to-one: two identical imported rows against one saved transaction flag only one.
 */
export function findDuplicates(rows: DuplicateKey[], existing: DuplicateKey[]): boolean[] {
  const left = new Map<string, number>();
  for (const e of existing) {
    const k = duplicateKey(e);
    left.set(k, (left.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const k = duplicateKey(r);
    const n = left.get(k) ?? 0;
    if (n <= 0) return false;
    left.set(k, n - 1);
    return true;
  });
}
