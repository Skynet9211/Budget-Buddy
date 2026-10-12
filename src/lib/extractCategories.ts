import { supabase } from "./supabase";
import { cleanSuggestions, splitLocally } from "./categories";

export interface ExtractResult {
  transcript?: string;
  categories: string[];
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

/** Send typed text to the AI to turn it into clean category names. Falls back to local splitting. */
export async function extractFromText(text: string, existing: string[]): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke("extract-categories", { body: { text } });
  if (error) {
    const local = cleanSuggestions(splitLocally(text), existing);
    if (local.length) return { categories: local };
    throw new Error(await errorMessage(error));
  }
  return { categories: cleanSuggestions(data?.categories, existing) };
}

/** Send recorded audio to be transcribed and turned into category names. */
export async function extractFromAudio(audio: Blob, existing: string[]): Promise<ExtractResult> {
  const form = new FormData();
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", audio, `voice.${ext}`);
  const { data, error } = await supabase.functions.invoke("extract-categories", { body: form });
  if (error) throw new Error(await errorMessage(error));
  return {
    transcript: typeof data?.transcript === "string" ? data.transcript : undefined,
    categories: cleanSuggestions(data?.categories, existing),
  };
}
