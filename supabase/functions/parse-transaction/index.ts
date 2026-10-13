// Supabase Edge Function (Deno). Turns what the user types or says (English, Hindi or Hinglish), e.g.
//   "15 sep akhil 500rs"   /   "आज अखिल को 500 रुपये दिए"   /   "kal salary 25000 mila"
// into structured transactions (one note can hold several): date, amount, debit/credit, who, and
// which category each belongs to.
//
//   POST JSON      { "text": "...", "today": "2026-10-12" }
//   POST multipart  audio=<file>, today=<YYYY-MM-DD>   (speech is transcribed first)
//
// Nothing is saved here. The app shows the result for confirmation, then calls the
// `add_transactions` database function. The Groq key lives in the GROQ_API_KEY secret.

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveByVectors } from "../_shared/vectors.ts";

const GROQ_URL = "https://api.groq.com/openai/v1";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 1000;
const MAX_TRANSACTIONS = 20;
const MAX_CATEGORIES = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You turn a personal-finance note into structured transactions. The note may be English, Hindi (Devanagari) or Hinglish (Hindi in Latin letters), typed or transcribed from speech, so expect small spelling mistakes.
The note can contain ONE or SEVERAL transactions, separated by commas, "and", "aur", "फिर", "then", semicolons, new lines, or simply by a new amount/person. Return one entry per transaction, in the order they were said.
You are given today's date and the user's existing categories.

Return ONLY JSON of this shape:
{"transactions": [{"date": "YYYY-MM-DD", "amount": <number or null>, "type": "debit" | "credit", "party": <string or null>, "category": <exact name from the list or null>, "new_category": <string or null>}]}
Return {"transactions": []} if the note contains no transaction.

The parts of a transaction (date, amount, who, debit/credit wording) can come in ANY order and the user may leave some out. Identify each part by what it is, never by its position. All of these mean the same thing: "15 sep akhil 500rs", "akhil 500rs 15 sep", "500rs akhil 15 sep", "akhil ko 500 diye 15 sep ko", "paid akhil 500 on 15 sep", "on 15 sep I gave 500 to akhil", "500 to akhil, 15th September", "debit 500 akhil 15/09".

Rules:
- Several transactions: a segment is one transaction. A date or day-word ("today", "kal", "15 sep", "monday") inside a segment, before OR after its amount and person, belongs to that segment. A segment with no date of its own reuses the date of the nearest earlier segment that has one; if none is earlier, the nearest later dated segment; if no segment has a date, today. ("kal swiggy 300, uber 150" = both yesterday; "swiggy 300, uber 150 kal" = both yesterday; "15 sep akhil 500, ramesh 200, 16 sep rent 9000" = the first two on 15 Sep, the last on 16 Sep.) "500 each"/"dono ko 500" gives every named person that amount. Never merge two different people or shops into one entry and never split one transaction into two.
- date: resolve to a full YYYY-MM-DD using today's date. Indian day-first order: "15/09", "15-09-2026", "15.9.26", "15th Sep", "Sep 15", "15 September", "15 sep 2026", "2026-09-15". With no year, use the most recent such date that is not in the future (if it would be after today, use the previous year). Two-digit years are 20xx. "today"/"aaj"/"आज" = today. "yesterday"/"kal"/"कल" = yesterday. "parso"/"परसों" = the day before yesterday. A weekday name ("monday", "last friday", "pichle somvar") = the most recent such day on or before today. "last month 5th" = the 5th of the previous month. Understand Hindi month names (जनवरी, फ़रवरी, मार्च, अप्रैल, मई, जून, जुलाई, अगस्त, सितंबर, अक्टूबर, नवंबर, दिसंबर) and spelled-out numbers ("fifteen september").
- amount: a positive number in rupees. Understand "500rs", "rs 500", "rs. 500", "rupees 500", "500 rupees", "500 rupaye", "₹500", "500/-", "2k" (2000), "1.5 lakh" (150000), "5 hundred", "five hundred", words like "paanch sau"/"पाँच सौ" (500), "dedh sau"/"डेढ़ सौ" (150), "dhai sau" (250), and Devanagari digits (५००). A number next to a month name or in a date format like 15/09 is the date, not the amount; a number marked with rs/rupees/₹ is the amount. If two bare numbers remain ambiguous, the larger one is the amount. If there is no amount, use null. Never invent one.
- type: decide the direction of the money from the wording and grammar, wherever it appears. The speaker is the user. "debit" (money OUT): paid, pay, spent, bought, gave, give, sent, transferred, lent, bill, rent, recharge, "to <name>", "<name> ko", "diye", "diya", "bheje", "kharch", "kharcha", "bhara", "maine <name> ko ...", "दिए", "दिया", "भेजे", "खर्च", or the word "debit"/"dr". "credit" (money IN): received, got, earned, salary, refund, cashback, credited, "from <name>", "<name> se ... mile/mila/aaye", "<name> ne mujhe/humko ... diye", "wapas mile", "मिला", "मिले", "आया", "वापस मिले", or the word "credit"/"cr"/"income". Hindi "ko" marks the receiver (debit), "se" marks the source (credit). When truly unclear, use "debit".
- party: the person, shop, brand, app or company the money went to or came from, e.g. "Akhil", "Swiggy", "Amazon". Write it in Latin letters, Title case, transliterating Hindi names (अखिल -> "Akhil"). Do not put amounts, dates, particles ("ko", "se", "ne", "to", "from") or generic words in it. Use null if there is none.
- category: choose from the existing list ONLY when it is a genuinely good fit, copying the name exactly. Otherwise set category to null and give new_category: a short name (1-3 words, Title case). Brand, app and store names are valid categories and keep their spelling (e.g. "Swiggy", "Amazon", "Uber"). A person-to-person payment with no stated purpose belongs in "Friends & Family". Income such as salary or interest belongs in a category like "Salary" or "Income". If you pick from the list, new_category must be null.
- Never include explanations, only the JSON.`;

async function transcribe(audio: File, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, audio.name || "voice.webm");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  form.append("temperature", "0");
  // Short clips are often misdetected (e.g. as Icelandic). A mixed Hindi/English prompt keeps
  // detection on Hindi or English. Set GROQ_TXN_STT_LANGUAGE (e.g. "hi" or "en") to pin it.
  const language = Deno.env.get("GROQ_TXN_STT_LANGUAGE");
  if (language) form.append("language", language);
  form.append("prompt", "15 sep Akhil 500 rupees. आज अखिल को 500 रुपये दिए. kal Swiggy 350 rs. salary 25000 mila.");
  const res = await fetch(`${GROQ_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.error("Groq STT error", res.status, await res.text());
    throw new Error(`Speech-to-text failed (${res.status})`);
  }
  const data = await res.json();
  return String(data.text ?? "").trim();
}

interface Raw {
  date?: unknown;
  amount?: unknown;
  type?: unknown;
  party?: unknown;
  category?: unknown;
  new_category?: unknown;
}

async function parseWithLlm(text: string, today: string, categories: string[], apiKey: string): Promise<Raw[]> {
  const list = categories.length ? categories.map((c) => `- ${c}`).join("\n") : "(none yet)";
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const request = () =>
    fetch(`${GROQ_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROQ_CHAT_MODEL") ?? "openai/gpt-oss-20b",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Today: ${today} (${weekday})\n\nExisting categories:\n${list}\n\nNote: ${text}`,
          },
        ],
      }),
    });

  let res = await request();
  if (res.status === 429) {
    // Free-tier tokens-per-minute limit: wait a few seconds and try once more.
    const wait = Math.min(Number((res.headers.get("retry-after") ?? "4")) || 4, 8);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await request();
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("The AI is busy right now. Please try again in a few seconds.");
    console.error("Groq chat error", res.status, await res.text());
    throw new Error(`AI request failed (${res.status})`);
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Never trust the model: validate and clean every field. */
function sanitize(raw: Raw, today: string, categories: { id: string; name: string }[]) {
  const date =
    typeof raw.date === "string" && isRealDate(raw.date) && raw.date <= addDays(today, 1) && raw.date >= "2000-01-01"
      ? raw.date
      : today;

  let amount: number | null = null;
  const n = typeof raw.amount === "string" ? Number(raw.amount.replace(/[, ]/g, "")) : raw.amount;
  if (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1e11) amount = Math.round(n * 100) / 100;

  const type = raw.type === "credit" ? "credit" : "debit";

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
    if (same) return { date, amount, type, party, category: same, new_category: null };
  }

  return { date, amount, type, party, category: picked, new_category: newCategory };
}

type Sanitized = ReturnType<typeof sanitize>;
type CategorySource = "history" | "name" | "llm" | null;

/**
 * The LLM has already read the note and made its own category guess (the last tier). Before the
 * user sees it, check it against the vector tiers, which know this user's habits:
 *   1. HISTORY: similar past transactions agree on a category -> use that, it beats the guess.
 *   2. NAME:    the party is a near-exact match for a category name -> use it, but only when the
 *               LLM didn't already pick an existing category.
 * Never throws: if vectors are unavailable the LLM's answer is kept as is.
 */
async function refineCategories(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  items: Sanitized[],
): Promise<Array<Sanitized & { category_source: CategorySource }>> {
  const cache = new Map<string, Awaited<ReturnType<typeof resolveByVectors>>>();
  const out: Array<Sanitized & { category_source: CategorySource }> = [];

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return json({ error: "Server is missing GROQ_API_KEY" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in first" }, 401);

  // This client carries the caller's JWT, so row-level security limits reads to their own categories.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Session expired. Please sign in again." }, 401);

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let transcript: string | undefined;
    let text = "";
    let todayInput = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File)) return json({ error: "No audio provided" }, 400);
      if (audio.size > MAX_AUDIO_BYTES) return json({ error: "Recording is too long" }, 413);
      todayInput = String(form.get("today") ?? "");
      transcript = await transcribe(audio, apiKey);
      text = transcript;
    } else {
      const body = await req.json();
      text = String(body?.text ?? "");
      todayInput = String(body?.today ?? "");
    }

    text = text.trim().slice(0, MAX_TEXT_CHARS);
    if (!text) return json({ error: "Didn't catch anything. Please try again." }, 422);

    // The app sends the user's local date (their "today" can differ from the server's UTC day).
    const serverToday = new Date().toISOString().slice(0, 10);
    const today = isRealDate(todayInput) && Math.abs(Date.parse(todayInput) - Date.parse(serverToday)) <= 2 * 86400000
      ? todayInput
      : serverToday;

    const { data: rows, error: catError } = await supabase
      .from("categories")
      .select("id,name")
      .order("created_at", { ascending: true })
      .limit(MAX_CATEGORIES);
    if (catError) throw new Error(catError.message);
    const categories = rows ?? [];

    const raw = await parseWithLlm(text, today, categories.map((c) => c.name), apiKey);
    const parsed = raw
      .slice(0, MAX_TRANSACTIONS)
      .map((r) => sanitize(r, today, categories))
      // An entry with neither an amount nor a person carries no information.
      .filter((t) => t.amount !== null || t.party !== null);
    const transactions = await refineCategories(supabase, parsed);
    return json({ transcript, text, transactions });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Something went wrong" }, 500);
  }
});
