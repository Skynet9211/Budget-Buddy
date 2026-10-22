import type { Expense, Granularity, MultiCategoryMode, PaymentFlow, PaymentMode } from "../types";
import {
  addDays,
  formatMonthYear,
  formatShortDate,
  fromISO,
  startOfMonth,
  startOfWeek,
  toISO,
} from "./dates";

export const UNCATEGORIZED = "Uncategorized";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function filterByRange(expenses: Expense[], from: string, to: string): Expense[] {
  // ISO dates compare correctly as strings.
  return expenses.filter((e) => e.date >= from && e.date <= to);
}

/** Total spend. Each expense counts once, however many categories it has. */
export function totalSpend(expenses: Expense[]): number {
  return round2(expenses.reduce((sum, e) => sum + e.amount, 0));
}

export interface CategoryTotal {
  name: string;
  value: number;
  count: number;
}

/**
 * Spend per category, biggest first. An expense in several categories is either split evenly
 * between them ("split", so the totals add up) or counted in full in each ("full").
 */
export function categoryTotals(expenses: Expense[], mode: MultiCategoryMode): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const e of expenses) {
    const cats = e.categories.length > 0 ? e.categories : [UNCATEGORIZED];
    const share = mode === "split" ? e.amount / cats.length : e.amount;
    for (const c of cats) {
      const entry = map.get(c) ?? { name: c, value: 0, count: 0 };
      entry.value += share;
      entry.count += 1;
      map.set(c, entry);
    }
  }
  return [...map.values()]
    .map((c) => ({ ...c, value: round2(c.value) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export interface TimeBucket {
  key: string;
  label: string;
  total: number;
}

/**
 * Buckets spend by week (Mon-Sun) or month between `from` and `to`. Empty buckets inside the range
 * are kept so the chart has no gaps. The start is trimmed to the first expense, so "All time"
 * (from 2000) doesn't draw decades of empty bars.
 */
export function timeSeries(
  expenses: Expense[],
  from: string,
  to: string,
  granularity: Granularity,
): TimeBucket[] {
  if (expenses.length === 0) return [];

  const firstExpense = expenses.reduce((min, e) => (e.date < min ? e.date : min), expenses[0].date);
  const start = fromISO(firstExpense > from ? firstExpense : from);
  const end = fromISO(to);

  const totals = new Map<string, number>();
  for (const e of expenses) {
    const d = fromISO(e.date);
    const key = toISO(granularity === "weekly" ? startOfWeek(d) : startOfMonth(d));
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }

  const buckets: TimeBucket[] = [];
  if (granularity === "weekly") {
    for (let d = startOfWeek(start); d <= end; d = addDays(d, 7)) {
      const key = toISO(d);
      buckets.push({ key, label: formatShortDate(d), total: round2(totals.get(key) ?? 0) });
    }
  } else {
    for (let d = startOfMonth(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const key = toISO(d);
      buckets.push({ key, label: formatMonthYear(d), total: round2(totals.get(key) ?? 0) });
    }
  }
  return buckets;
}

export function filterFlowsByRange(flows: PaymentFlow[], from: string, to: string): PaymentFlow[] {
  return flows.filter((f) => f.date >= from && f.date <= to);
}

export interface PaymentModeTotal {
  id: string;
  name: string;
  /** Money out through this mode. */
  debit: number;
  /** Money in through this mode. */
  credit: number;
  count: number;
}

/**
 * Money out (debit) and money in (credit) per mode of payment, busiest mode first. Only modes that
 * have transactions are returned. A mode missing from `modes` (e.g. removed later) is still listed,
 * under its id.
 */
export function paymentModeTotals(flows: PaymentFlow[], modes: PaymentMode[]): PaymentModeTotal[] {
  const names = new Map(modes.map((m) => [m.id, m.name]));
  const map = new Map<string, PaymentModeTotal>();
  for (const f of flows) {
    const entry = map.get(f.paymentMode) ?? {
      id: f.paymentMode,
      name: names.get(f.paymentMode) ?? f.paymentMode,
      debit: 0,
      credit: 0,
      count: 0,
    };
    if (f.type === "credit") entry.credit += f.amount;
    else entry.debit += f.amount;
    entry.count += 1;
    map.set(f.paymentMode, entry);
  }
  return [...map.values()]
    .map((m) => ({ ...m, debit: round2(m.debit), credit: round2(m.credit) }))
    .sort((a, b) => b.debit + b.credit - (a.debit + a.credit) || a.name.localeCompare(b.name));
}

/** The earliest expense date, or null if there are none. */
export function firstDate(expenses: Expense[]): string | null {
  return expenses.length ? expenses.reduce((m, e) => (e.date < m ? e.date : m), expenses[0].date) : null;
}
