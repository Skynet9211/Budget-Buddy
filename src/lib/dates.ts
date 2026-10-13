/** Earliest date used for the "All time" filter. */
export const ALL_TIME_START = "2000-01-01";

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as a local date (avoids UTC shifting). */
export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Same day-of-month one month earlier, clamped to the end of shorter months. */
export function oneMonthAgo(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

/** Monday of the week containing d. */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (r.getDay() + 6) % 7; // Monday = 0
  r.setDate(r.getDate() - diff);
  return r;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Whole days from `from` to `to`, counting both ends (min 1). */
export function daysInclusive(from: string, to: string): number {
  const ms = fromISO(to).getTime() - fromISO(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const monthYear = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });
const fullDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const formatShortDate = (d: Date) => shortDate.format(d);
export const formatMonthYear = (d: Date) => monthYear.format(d);
export const formatFullDate = (iso: string) => fullDate.format(fromISO(iso));
