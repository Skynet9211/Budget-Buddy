// Supabase Edge Function (Deno). Reads one chunk of text extracted from a bank, UPI or credit-card
// statement and returns the transactions in it that fall inside the user's date range.
//
//   POST JSON  { "text": "...", "from": "2026-09-01", "to": "2026-09-30", "today": "2026-10-12" }
//
// The app splits a long statement into chunks and calls this once per chunk. Nothing is saved
// here: the rows are shown in an editable table first, then saved with `add_transactions`.

import {
  authenticate,
  chatForTransactions,
  corsHeaders,
  isRealDate,
  json,
  loadCategoriesAndModes,
  refineCategories,
  resolveToday,
  sanitize,
  type PaymentMode,
  type Raw,
} from "../_shared/transactions.ts";

const MAX_TEXT_CHARS = 12000;
const MAX_TRANSACTIONS = 200;

const SYSTEM_PROMPT = `You read text copied out of an Indian bank account, UPI app or credit card statement and turn its transaction rows into structured JSON.
The text was extracted from a PDF or Word file and a long narration may wrap onto the next line. From a PDF, each line is laid out like a fixed-width printout: every value starts at the same character position as its column header, and empty cells are just blank space. From a Word table, cells are separated by " | " and an empty cell shows as "|  |". Use the header row (e.g. "Date  Narration  Chq/Ref No  Withdrawal  Deposit  Balance") and each amount's position under it to know which column the amount is in.
You are given a date range, the user's existing categories and the payment modes.

Return ONLY JSON of this shape:
{"transactions": [{"date": "YYYY-MM-DD", "amount": <number>, "type": "debit" | "credit", "party": <string or null>, "description": <string>, "category": <exact name from the list or null>, "new_category": <string or null>, "payment_mode": <id from the payment modes list or null>}]}
Return {"transactions": []} if no transaction row falls inside the date range.

Rules:
- One entry per transaction row, in statement order. Include ONLY rows whose transaction date is between the range's From and To dates, inclusive. Never invent rows.
- Skip opening balance, closing balance, "B/F", "C/F", totals, summaries, interest/charges tables that are not transactions, page headers and footers.
- date: the transaction date (not the value date if both are shown), as YYYY-MM-DD. Statements use day-first order: "05/09/2026", "05-09-26", "05 Sep 2026", "05-SEP-2026". Two-digit years are 20xx.
- amount: a positive number, without commas or currency symbols. It comes from the Withdrawal/Debit/Dr column or the Deposit/Credit/Cr column. NEVER use the Balance column.
- type: "debit" when the amount is in a Withdrawal/Debit/Dr column or marked "Dr"; "credit" when it is in a Deposit/Credit/Cr column or marked "Cr". On a credit card statement, purchases are debit and payments/refunds/cashback are credit.
- party: the person, shop, brand or company in the narration, in Title case, e.g. "UPI/412345678901/SWIGGY/swiggy@icici/Payment" -> "Swiggy", "NEFT-HDFC0001234-RAMESH KUMAR" -> "Ramesh Kumar", "POS 4321 AMAZON PAY IN" -> "Amazon". Leave out reference numbers, UPI handles, bank codes and words like UPI, NEFT, IMPS, POS. Use null if there is no name (e.g. "ATM WDL" or "INTEREST CREDIT").
- description: the row's original narration text, joined into one line, at most 120 characters.
- category: choose from the existing list ONLY when it is a genuinely good fit, copying the name exactly. Otherwise set category to null and give new_category: a short name (1-3 words, Title case). Brand, app and store names are valid categories (e.g. "Swiggy", "Amazon", "Uber"). Transfers to a person with no stated purpose belong in "Friends & Family". Salary or interest belongs in a category like "Salary" or "Income". If you pick from the list, new_category must be null.
- payment_mode: from markers in the narration: "UPI" -> upi, "NEFT"/"IMPS"/"RTGS"/"NET BANKING"/"IB" -> netbanking, "ATM"/"CASH" -> cash, "POS"/"CARD"/any credit card statement purchase -> card, "CHQ"/"CHEQUE"/"CLG" -> cheque, "WALLET" -> wallet. Use null when there is no marker.
- Never include explanations, only the JSON.`;

const cleanDescription = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, 120) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return json({ error: "Server is missing GROQ_API_KEY" }, 500);

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  try {
    const body = await req.json();
    const text = String(body?.text ?? "").trim().slice(0, MAX_TEXT_CHARS);
    const from = String(body?.from ?? "");
    const to = String(body?.to ?? "");
    const today = resolveToday(String(body?.today ?? ""));

    if (!text) return json({ transactions: [] });
    if (!isRealDate(from) || !isRealDate(to) || from > to) {
      return json({ error: "Choose a valid date range." }, 422);
    }

    const { categories, modes } = await loadCategoriesAndModes(supabase);
    const list = categories.length ? categories.map((c) => `- ${c.name}`).join("\n") : "(none yet)";
    const modeList = modes.map((m: PaymentMode) => `- ${m.id} (${m.name})`).join("\n");

    const raw = await chatForTransactions(
      SYSTEM_PROMPT,
      `Date range: From ${from} To ${to}\n\nExisting categories:\n${list}\n\nPayment modes:\n${modeList}\n\nStatement text:\n${text}`,
      apiKey,
    );

    const parsed = raw
      // The model is told about the range, but the range is enforced here, not trusted to it.
      .filter((r: Raw) => isRealDate(r.date) && r.date >= from && r.date <= to)
      .slice(0, MAX_TRANSACTIONS)
      .map((r) => ({
        ...sanitize(r, today, categories, modes),
        description: cleanDescription((r as { description?: unknown }).description),
      }))
      // A statement row without an amount is a heading or a summary line, not a transaction.
      .filter((t) => t.amount !== null);

    const transactions = await refineCategories(supabase, parsed);
    return json({ transactions });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Something went wrong" }, 500);
  }
});
