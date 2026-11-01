// Supabase Edge Function (Deno). Turns typed text or recorded audio into a clean list of
// spending-category names using Groq with Gemini as a server-side fallback.

import { chatWithFallback, hasAiProviderKey, transcribeWithGemini } from "../_shared/ai.ts";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 500;

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

const SYSTEM_PROMPT = `You extract personal-budget spending category names from what a user says or types.
Rules:
- Return ONLY JSON: {"categories": ["Name1", "Name2"]}
- Each category is a short name (1-3 words) for a type of thing people spend money on, e.g. "Groceries", "Eating out", "Transport", "Rent", "Subscriptions".
- Ignore filler words and commands such as "add", "create", "please", "category", "um", "I want to".
- App, brand, store and service names are valid categories. Keep them exactly as the user said, with their proper capitalisation: "Amazon", "Swiggy", "Zomato", "Flipkart", "Uber", "Netflix", "Google Pay", "BigBasket". Never replace a brand with a generic name (do not turn "Swiggy" into "Food delivery").
- If the user names specific items (e.g. "petrol"), keep them as the category name in Title case ("Petrol") unless a clearly better general name exists.
- Split lists into separate categories. Remove duplicates.
- Fix obvious speech-recognition mistakes when the intent is clear.
- If nothing related to spending categories is said, return {"categories": []}.
- Never include explanations.`;

async function transcribe(audio: File): Promise<string> {
  const form = new FormData();
  form.append("file", audio, audio.name || "voice.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("language", Deno.env.get("GROQ_STT_LANGUAGE") || "en");
  form.append("prompt", "Spending categories and apps: rent, groceries, transport, eating out, utilities, subscriptions, Amazon, Flipkart, Swiggy, Zomato, Uber, Ola, Netflix, Spotify, BigBasket, Myntra.");
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (apiKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: form });
      if (!res.ok) {
        console.error("Groq STT error", res.status, await res.text());
        throw new Error("Speech-to-text failed (" + res.status + ")");
      }
      const data = await res.json();
      if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
      throw new Error("Groq returned an empty transcript");
    } catch (err) {
      console.error("Groq transcription failed; trying Gemini:", (err as Error).message);
    }
  }
  return await transcribeWithGemini(audio, "This is a request to add spending categories such as rent, groceries, transport, Amazon, Swiggy, or Netflix.");
}

async function extract(text: string): Promise<string[]> {
  const content = await chatWithFallback(SYSTEM_PROMPT, text);
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.categories) ? parsed.categories.filter((c: unknown) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!hasAiProviderKey()) return json({ error: "Server is missing GROQ_API_KEY and GEMINI_API_KEY" }, 500);

  // Require a signed-in user so the AI quota can't be used by strangers.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in first" }, 401);
  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
  });
  if (!userRes.ok) return json({ error: "Session expired. Please sign in again." }, 401);

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let transcript: string | undefined;
    let text = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File)) return json({ error: "No audio provided" }, 400);
      if (audio.size > MAX_AUDIO_BYTES) return json({ error: "Recording is too long" }, 413);
      transcript = await transcribe(audio);
      text = transcript;
    } else {
      const body = await req.json();
      text = String(body?.text ?? "");
    }

    text = text.trim().slice(0, MAX_TEXT_CHARS);
    if (!text) return json({ transcript, categories: [] });

    const categories = await extract(text);
    return json({ transcript, categories });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Something went wrong" }, 500);
  }
});
