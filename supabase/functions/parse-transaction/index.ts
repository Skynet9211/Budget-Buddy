// Supabase Edge Function (Deno). Turns what the user types or says (English, Hindi or Hinglish), e.g.
//   "15 sep akhil 500rs"   /   "आज अखिल को 500 रुपये दिए"   /   "kal salary 25000 mila"
// into structured transactions (one note can hold several): date, amount, debit/credit, who,
// which category each belongs to, and the mode of payment ("cash", "card", ...; UPI when not said).
//
//   POST JSON      { "text": "...", "today": "2026-10-12" }
//   POST multipart  audio=<file>, today=<YYYY-MM-DD>   (speech is transcribed first)
//
// Nothing is saved here. The app shows the result for confirmation, then calls the
// `add_transactions` database function. The Groq key lives in the GROQ_API_KEY secret.

import {
  GROQ_URL,
  authenticate,
  chatForTransactions,
  corsHeaders,
  json,
  loadCategoriesAndModes,
  refineCategories,
  resolveToday,
  sanitize,
  type PaymentMode,
  type Raw,
} from "../_shared/transactions.ts";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 1000;
const MAX_TRANSACTIONS = 20;

const SYSTEM_PROMPT = `You turn a personal-finance note into structured transactions. The note may be English, Hindi (Devanagari) or Hinglish (Hindi in Latin letters), typed or transcribed from speech, so expect small spelling mistakes.
The note can contain ONE or SEVERAL transactions, separated by commas, "and", "aur", "फिर", "then", semicolons, new lines, or simply by a new amount/person. Return one entry per transaction, in the order they were said.
You are given today's date and the user's existing categories.

Return ONLY JSON of this shape:
{"transactions": [{"date": "YYYY-MM-DD", "amount": <number or null>, "type": "debit" | "credit", "party": <string or null>, "category": <exact name from the list or null>, "new_category": <string or null>, "payment_mode": <id from the payment modes list or null>}]}
Return {"transactions": []} if the note contains no transaction.

The parts of a transaction (date, amount, who, debit/credit wording) can come in ANY order and the user may leave some out. Identify each part by what it is, never by its position. All of these mean the same thing: "15 sep akhil 500rs", "akhil 500rs 15 sep", "500rs akhil 15 sep", "akhil ko 500 diye 15 sep ko", "paid akhil 500 on 15 sep", "on 15 sep I gave 500 to akhil", "500 to akhil, 15th September", "debit 500 akhil 15/09".

Rules:
- Several transactions: a segment is one transaction. A date or day-word ("today", "kal", "15 sep", "monday") inside a segment, before OR after its amount and person, belongs to that segment. A segment with no date of its own reuses the date of the nearest earlier segment that has one; if none is earlier, the nearest later dated segment; if no segment has a date, today. ("kal swiggy 300, uber 150" = both yesterday; "swiggy 300, uber 150 kal" = both yesterday; "15 sep akhil 500, ramesh 200, 16 sep rent 9000" = the first two on 15 Sep, the last on 16 Sep.) "500 each"/"dono ko 500" gives every named person that amount. Never merge two different people or shops into one entry and never split one transaction into two.
- date: resolve to a full YYYY-MM-DD using today's date. Indian day-first order: "15/09", "15-09-2026", "15.9.26", "15th Sep", "Sep 15", "15 September", "15 sep 2026", "2026-09-15". With no year, use the most recent such date that is not in the future (if it would be after today, use the previous year). Two-digit years are 20xx. "today"/"aaj"/"आज" = today. "yesterday"/"kal"/"कल" = yesterday. "parso"/"परसों" = the day before yesterday. A weekday name ("monday", "last friday", "pichle somvar") = the most recent such day on or before today. "last month 5th" = the 5th of the previous month. Understand Hindi month names (जनवरी, फ़रवरी, मार्च, अप्रैल, मई, जून, जुलाई, अगस्त, सितंबर, अक्टूबर, नवंबर, दिसंबर) and spelled-out numbers ("fifteen september").
- amount: a positive number in rupees. Understand "500rs", "rs 500", "rs. 500", "rupees 500", "500 rupees", "500 rupaye", "₹500", "500/-", "2k" (2000), "1.5 lakh" (150000), "5 hundred", "five hundred", words like "paanch sau"/"पाँच सौ" (500), "dedh sau"/"डेढ़ सौ" (150), "dhai sau" (250), and Devanagari digits (५००). A number next to a month name or in a date format like 15/09 is the date, not the amount; a number marked with rs/rupees/₹ is the amount. If two bare numbers remain ambiguous, the larger one is the amount. If there is no amount, use null. Never invent one.
- type: decide the direction of the money from the wording and grammar, wherever it appears. The speaker is the user. "debit" (money OUT): paid, pay, spent, bought, gave, give, sent, transferred, lent, bill, rent, recharge, "to <name>", "<name> ko", "diye", "diya", "bheje", "kharch", "kharcha", "bhara", "maine <name> ko ...", "दिए", "दिया", "भेजे", "खर्च", or the word "debit"/"dr". "credit" (money IN): received, got, earned, salary, refund, cashback, credited, "from <name>", "<name> se ... mile/mila/aaye", "<name> ne mujhe/humko ... diye", "wapas mile", "मिला", "मिले", "आया", "वापस मिले", or the word "credit"/"cr"/"income". Hindi "ko" marks the receiver (debit), "se" marks the source (credit). When truly unclear, use "debit".
- party: the person, shop, brand, app or company the money went to or came from, e.g. "Akhil", "Swiggy", "Amazon". Write it in Latin letters, Title case, transliterating Hindi names (अखिल -> "Akhil"). Do not put amounts, dates, particles ("ko", "se", "ne", "to", "from") or generic words in it. Use null if there is none.
- category: choose from the existing list ONLY when it is a genuinely good fit, copying the name exactly. Otherwise set category to null and give new_category: a short name (1-3 words, Title case). Brand, app and store names are valid categories and keep their spelling (e.g. "Swiggy", "Amazon", "Uber"). A person-to-person payment with no stated purpose belongs in "Friends & Family". Income such as salary or interest belongs in a category like "Salary" or "Income". If you pick from the list, new_category must be null.
- payment_mode: how the money was paid or received. Use the id from the "Payment modes" list ONLY when the note explicitly says so, e.g. "cash"/"nakad"/"नकद" -> cash, "gpay"/"phonepe"/"upi" -> upi, "card"/"credit card"/"debit card" -> card, "netbanking"/"neft"/"imps"/"rtgs"/"bank transfer" -> netbanking, "wallet"/"paytm wallet" -> wallet, "cheque" -> cheque. The mode word belongs to the transaction it sits in ("blinkit 300 cash, uber 150" = only Blinkit is cash). It is NOT a party or a category. If the note says nothing about it, or says something that is not in the list, use null.
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

async function parseWithLlm(
  text: string,
  today: string,
  categories: string[],
  modes: PaymentMode[],
  apiKey: string,
): Promise<Raw[]> {
  const list = categories.length ? categories.map((c) => `- ${c}`).join("\n") : "(none yet)";
  const modeList = modes.map((m) => `- ${m.id} (${m.name})`).join("\n");
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return await chatForTransactions(
    SYSTEM_PROMPT,
    `Today: ${today} (${weekday})\n\nExisting categories:\n${list}\n\nPayment modes:\n${modeList}\n\nNote: ${text}`,
    apiKey,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return json({ error: "Server is missing GROQ_API_KEY" }, 500);

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

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

    const today = resolveToday(todayInput);
    const { categories, modes } = await loadCategoriesAndModes(supabase);

    const raw = await parseWithLlm(text, today, categories.map((c) => c.name), modes, apiKey);
    const parsed = raw
      .slice(0, MAX_TRANSACTIONS)
      .map((r) => sanitize(r, today, categories, modes))
      // An entry with neither an amount nor a person carries no information.
      .filter((t) => t.amount !== null || t.party !== null);
    const transactions = await refineCategories(supabase, parsed);
    return json({ transcript, text, transactions });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Something went wrong" }, 500);
  }
});
