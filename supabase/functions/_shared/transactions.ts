// Shared by `parse-transaction` (typed/spoken notes) and `parse-statement` (bank statements):
// the Groq chat call, field validation, payment-mode resolution and the vector category check.

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveByVectors } from "./vectors.ts";

export const GROQ_URL = "https://api.groq.com/openai/v1";
const MAX_CATEGORIES = 100;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface Raw {
  date?: unknown;
  amount?: unknown;
  type?: unknown;
  party?: unknown;
  category?: unknown;
  new_category?: unknown;
  payment_mode?: unknown;
}

export interface PaymentMode {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

/** The default mode, used whenever the note names none or names one we don't know. */
const DEFAULT_MODE = "upi";

/** Used only if the `payment_modes` table can't be read (migration 007 not applied yet). */
const FALLBACK_MODES: PaymentMode[] = [
  { id: "upi", name: "UPI" },
  { id: "cash", name: "Cash" },
  { id: "card", name: "Card" },
  { id: "netbanking", name: "Net Banking" },
  { id: "wallet", name: "Wallet" },
  { id: "cheque", name: "Cheque" },
];

/** Wordings the model may return instead of an exact id, mapped to the mode id. */
const MODE_ALIASES: Record<string, string> = {
  gpay: "upi",
  "google pay": "upi",
  phonepe: "upi",
  "phone pe": "upi",
  bhim: "upi",
  nakad: "cash",
  naqd: "cash",
  "नकद": "cash",
  atm: "cash",
  "credit card": "card",
  "debit card": "card",
  "atm card": "card",
  pos: "card",
  "net banking": "netbanking",
  "internet banking": "netbanking",
  neft: "netbanking",
  imps: "netbanking",
  rtgs: "netbanking",
  "bank transfer": "netbanking",
  "paytm wallet": "wallet",
  check: "cheque",
  chq: "cheque",
};

/** Maps whatever the model said to a known mode id. Anything missing or unrecognised is UPI. */
export function resolvePaymentMode(value: unknown, modes: PaymentMode[]): string {
  if (typeof value !== "string") return DEFAULT_MODE;
  const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!key) return DEFAULT_MODE;
  const exact = modes.find((m) => m.id === key.replace(/ /g, "") || m.name.toLowerCase() === key);
  if (exact) return exact.id;
  const alias = MODE_ALIASES[key];
  if (alias && modes.some((m) => m.id === alias)) return alias;
  return DEFAULT_MODE;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The app sends the user's local date (their "today" can differ from the server's UTC day). */
export function resolveToday(todayInput: string): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  return isRealDate(todayInput) && Math.abs(Date.parse(todayInput) - Date.parse(serverToday)) <= 2 * 86400000
    ? todayInput
    : serverToday;
}

/** Never trust the model: validate and clean every field. */
export function sanitize(raw: Raw, today: string, categories: Category[], modes: PaymentMode[]) {
  const date =
    isRealDate(raw.date) && raw.date <= addDays(today, 1) && raw.date >= "2000-01-01" ? raw.date : today;

  let amount: number | null = null;
  const n = typeof raw.amount === "string" ? Number(raw.amount.replace(/[, ]/g, "")) : raw.amount;
  if (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1e11) amount = Math.round(n * 100) / 100;

  const type: "debit" | "credit" = raw.type === "credit" ? "credit" : "debit";
  const payment_mode = resolvePaymentMode(raw.payment_mode, modes);

  const party =
    typeof raw.party === "string" && raw.party.trim()
      ? titleCase(raw.party.replace(/\s+/g, " ").trim().slice(0, 60))
      : null;

  const picked =
    typeof raw.category === "string"
      ? categories.find((c) => c.name.trim().toLowerCase() === (raw.category as string).trim().toLowerCase()) ?? null
      : null;

  let newCategory: string | null = null;
  if (!picked && typeof raw.new_category === "string" && raw.new_category.trim()) {
    newCategory = titleCase(raw.new_category.replace(/\s+/g, " ").trim().slice(0, 40));
    // The model suggested something we already have under a different case: use the existing one.
    const same = categories.find((c) => c.name.trim().toLowerCase() === newCategory!.toLowerCase());
    if (same) return { date, amount, type, party, payment_mode, category: same, new_category: null };
  }

  return { date, amount, type, party, payment_mode, category: picked, new_category: newCategory };
}

export type Sanitized = ReturnType<typeof sanitize>;
type CategorySource = "history" | "name" | "llm" | null;

/**
 * The LLM has already read the note and made its own category guess (the last tier). Before the
 * user sees it, check it against the vector tiers, which know this user's habits:
 *   1. HISTORY: similar past transactions agree on a category -> use that, it beats the guess.
 *   2. NAME:    the party is a near-exact match for a category name -> use it, but only when the
 *               LLM didn't already pick an existing category.
 * Never throws: if vectors are unavailable the LLM's answer is kept as is.
 */
export async function refineCategories<T extends Sanitized>(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  items: T[],
): Promise<Array<T & { category_source: CategorySource }>> {
  const cache = new Map<string, Awaited<ReturnType<typeof resolveByVectors>>>();
  const out: Array<T & { category_source: CategorySource }> = [];

  for (const t of items) {
    const fallback: CategorySource = t.category || t.new_category ? "llm" : null;
    if (!t.party) {
      out.push({ ...t, category_source: fallback });
      continue;
    }
    try {
      // History is per direction (a "Salary" credit must not vote on a debit), so key on both.
      const key = `${t.type}|${t.party.toLowerCase()}`;
      let found = cache.get(key);
      if (!found) {
        found = await resolveByVectors(supabase, t.party, { type: t.type });
        cache.set(key, found);
      }
      if (found.source === "history" && found.category) {
        out.push({ ...t, category: found.category, new_category: null, category_source: "history" });
      } else if (found.source === "name" && found.category && !t.category) {
        out.push({ ...t, category: found.category, new_category: null, category_source: "name" });
      } else {
        out.push({ ...t, category_source: fallback });
      }
    } catch (err) {
      console.warn("Vector categorisation skipped:", (err as Error).message);
      out.push({ ...t, category_source: fallback });
    }
  }
  return out;
}

/**
 * One JSON-mode chat completion. Retries once on the free-tier tokens-per-minute limit (429).
 * Returns the list of transaction objects the model produced, or [] if its reply isn't JSON.
 */
export async function chatForTransactions(system: string, user: string, apiKey: string): Promise<Raw[]> {
  const request = () =>
    fetch(`${GROQ_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROQ_CHAT_MODEL") ?? "openai/gpt-oss-20b",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

  let res = await request();
  if (res.status === 429) {
    const wait = Math.min(Number((res.headers.get("retry-after") ?? "4")) || 4, 8);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await request();
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("The AI is busy right now. Please try again in a few seconds.");
    const errorBody = await res.text();
    console.error("Groq chat error", res.status, errorBody);
    let detail = "";
    try {
      const providerMessage = (JSON.parse(errorBody) as { error?: { message?: unknown } })?.error?.message;
      if (typeof providerMessage === "string") detail = providerMessage.trim().slice(0, 300);
    } catch {
      // Some upstream errors aren't JSON; keep the generic status message in that case.
    }
    throw new Error(`AI request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = await res.json();
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    // Be forgiving: accept {"transactions": [...]}, a bare array, or a single object.
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.transactions) ? parsed.transactions : [parsed];
    return list.filter((t: unknown): t is Raw => !!t && typeof t === "object" && !Array.isArray(t));
  } catch {
    return [];
  }
}

/**
 * A Supabase client carrying the caller's JWT, so row-level security limits reads to their own rows.
 * Returns an error Response when the request isn't from a signed-in user.
 */
// deno-lint-ignore no-explicit-any
export async function authenticate(req: Request): Promise<{ supabase: any } | { error: Response }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "Please sign in first" }, 401) };

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return { error: json({ error: "Session expired. Please sign in again." }, 401) };
  return { supabase };
}

/** The user's categories (oldest first) and the payment modes, with a built-in list as fallback. */
// deno-lint-ignore no-explicit-any
export async function loadCategoriesAndModes(supabase: any): Promise<{ categories: Category[]; modes: PaymentMode[] }> {
  const { data: rows, error: catError } = await supabase
    .from("categories")
    .select("id,name")
    .order("created_at", { ascending: true })
    .limit(MAX_CATEGORIES);
  if (catError) throw new Error(catError.message);

  const { data: modeRows, error: modeError } = await supabase
    .from("payment_modes")
    .select("id,name")
    .order("sort_order", { ascending: true });
  if (modeError) console.warn("Payment modes unavailable, using built-in list:", modeError.message);
  const modes: PaymentMode[] = !modeError && modeRows?.length ? modeRows : FALLBACK_MODES;

  return { categories: rows ?? [], modes };
}
