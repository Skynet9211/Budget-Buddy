import type { Expense } from "../types";
import { supabase } from "./supabase";

export type TxnType = "debit" | "credit";

export interface ParsedTransaction {
  /** YYYY-MM-DD */
  date: string;
  amount: number | null;
  type: TxnType;
  party: string | null;
  category: { id: string; name: string } | null;
  /** A category to create because no existing one fits. */
  new_category: string | null;
  /** Who decided the category: the user's own history, a matching category name, or the AI. */
  category_source?: "history" | "name" | "llm" | null;
}

export interface ParseResult {
  /** What was heard, when the input was voice. */
  transcript?: string;
  text: string;
  /** One entry per transaction found in the note (a note can hold several). */
  transactions: ParsedTransaction[];
}

/** The user's local calendar date as YYYY-MM-DD (not UTC, so "today" is right late at night). */
export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function errorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* ignore */
    }
  }
  return (error as Error)?.message ?? "Something went wrong";
}

function toResult(data: unknown): ParseResult {
  const d = data as Partial<ParseResult> | null;
  const transactions = Array.isArray(d?.transactions) ? d.transactions : [];
  if (!transactions.length) {
    const heard = d?.transcript ? ` Heard: "${d.transcript}".` : "";
    throw new Error(`Couldn't find a transaction in that. Try something like "15 sep Akhil 500rs".${heard}`);
  }
  return { transcript: d?.transcript, text: d?.text ?? "", transactions };
}

export async function parseTransactionText(text: string): Promise<ParseResult> {
  const { data, error } = await supabase.functions.invoke("parse-transaction", {
    body: { text, today: localToday() },
  });
  if (error) throw new Error(await errorMessage(error));
  return toResult(data);
}

export async function parseTransactionAudio(audio: Blob): Promise<ParseResult> {
  const form = new FormData();
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", audio, `voice.${ext}`);
  form.append("today", localToday());
  const { data, error } = await supabase.functions.invoke("parse-transaction", { body: form });
  if (error) throw new Error(await errorMessage(error));
  return toResult(data);
}

export interface NewTransaction {
  type: TxnType;
  date: string;
  amount: number;
  party: string | null;
  categoryId: string | null;
  newCategory: string | null;
  rawText: string | null;
}

/**
 * Saves one or more transactions in a single all-or-nothing database call. Each transaction gets
 * its own id, shared by its date, amount and party rows. Returns the new transaction ids.
 */
export async function saveTransactions(items: NewTransaction[]): Promise<string[]> {
  const { data, error } = await supabase.rpc("add_transactions", {
    p_items: items.map((t) => ({
      type: t.type,
      date: t.date,
      amount: t.amount,
      party: t.party,
      category_id: t.categoryId,
      new_category: t.categoryId ? null : t.newCategory,
      raw_text: t.rawText,
    })),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

export interface Transaction {
  id: string;
  type: TxnType;
  date: string;
  amount: number;
  currency: string;
  party: string | null;
  category: { id: string; name: string } | null;
  createdAt: string;
}

// PostgREST returns one-to-one embeds as an object, but be tolerant of an array.
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id,type,created_at,category:categories!category_id(id,name),date:transaction_dates(txn_date),amount:transaction_amounts(amount,currency),party:transaction_parties(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return rows
    .map((r): Transaction => {
      const date = one<{ txn_date: string }>(r.date);
      const amount = one<{ amount: number | string; currency: string }>(r.amount);
      return {
        id: r.id,
        type: r.type,
        date: date?.txn_date ?? r.created_at.slice(0, 10),
        amount: Number(amount?.amount ?? 0),
        currency: amount?.currency ?? "INR",
        party: one<{ name: string }>(r.party)?.name ?? null,
        category: one<{ id: string; name: string }>(r.category),
        createdAt: r.created_at,
      };
    })
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

const SPENDING_PAGE = 1000;

/**
 * Every debit (money out) as a dashboard `Expense`, each with ALL of its categories.
 * Needs migration 005 (`transaction_categories`). Pages through the table because the API caps
 * one response (1000 rows by default) and "All time" must not silently truncate.
 */
export async function fetchSpending(): Promise<Expense[]> {
  const out: Expense[] = [];
  for (let from = 0; ; from += SPENDING_PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id,created_at,date:transaction_dates(txn_date),amount:transaction_amounts(amount),party:transaction_parties(name),cats:transaction_categories(category:categories(name))",
      )
      .eq("type", "debit")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + SPENDING_PAGE - 1);
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      const date = one<{ txn_date: string }>(r.date);
      const amount = one<{ amount: number | string }>(r.amount);
      const names: string[] = [];
      for (const c of (Array.isArray(r.cats) ? r.cats : []) as Array<{ category: unknown }>) {
        const name = one(c.category as { name: string } | { name: string }[] | null)?.name;
        if (name && !names.includes(name)) names.push(name);
      }
      out.push({
        id: r.id,
        date: date?.txn_date ?? String(r.created_at).slice(0, 10),
        amount: Number(amount?.amount ?? 0),
        description: one<{ name: string }>(r.party)?.name ?? "Expense",
        categories: names,
      });
    }
    if (rows.length < SPENDING_PAGE) break;
  }
  return out;
}

/** Adds categories to a transaction, keeping the ones it already has. Needs migration 005. */
export async function addTransactionCategories(transactionId: string, categoryIds: string[]): Promise<void> {
  if (!categoryIds.length) return;
  const { error } = await supabase.rpc("add_transaction_categories", {
    p_transaction_id: transactionId,
    p_category_ids: categoryIds,
  });
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(id: string): Promise<void> {
  // The date, amount and party rows are removed automatically (ON DELETE CASCADE).
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function formatMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
