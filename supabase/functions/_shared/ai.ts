const GROQ_URL = "https://api.groq.com/openai/v1";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"];

function getGeminiModels(): string[] {
  const configured = Deno.env.get("GEMINI_MODEL");
  return [...new Set([configured, ...DEFAULT_GEMINI_MODELS].filter((model): model is string => !!model))];
}

export function hasAiProviderKey(): boolean {
  return !!(Deno.env.get("GROQ_API_KEY") || Deno.env.get("GEMINI_API_KEY"));
}

function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message;
    if (typeof message === "string") return message.trim().slice(0, 300);
  } catch {
    // Keep a short response excerpt for non-JSON upstream errors.
  }
  return body.trim().slice(0, 300);
}

async function geminiRequest(path: string, body: unknown): Promise<Response> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return await fetch(`${GEMINI_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
}

async function readGeminiText(response: Response): Promise<string> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status})${body ? `: ${errorMessage(body)}` : ""}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: unknown }) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function geminiModelsRequest(
  request: (model: string) => Promise<Response>,
): Promise<string> {
  const failures: string[] = [];
  for (const model of getGeminiModels()) {
    try {
      return await readGeminiText(await request(model));
    } catch (err) {
      const message = (err as Error).message;
      console.error(`Gemini ${model} request error:`, message);
      failures.push(`${model}: ${message}`);
    }
  }
  throw new Error(`Gemini fallback failed. ${failures.join("; ")}`);
}

async function groqChat(system: string, user: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const request = () => fetch(`${GROQ_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_CHAT_MODEL") || "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  let response = await request();
  if (response.status === 429) {
    let wait = Number(response.headers.get("retry-after") || "4");
    if (!Number.isFinite(wait) || wait <= 0) wait = 4;
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 8) * 1000));
    response = await request();
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error("Groq chat request failed (" + response.status + ")" + (body ? ": " + errorMessage(body) : ""));
  }
  const data = await response.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Groq returned an empty response");
  return text;
}

export async function chatWithFallback(system: string, user: string): Promise<string> {
  const failures: string[] = [];
  if (Deno.env.get("GROQ_API_KEY")) {
    try {
      return await groqChat(system, user);
    } catch (err) {
      const message = (err as Error).message;
      console.error("Groq chat error; trying Gemini:", message);
      failures.push(message);
    }
  }

  if (!Deno.env.get("GEMINI_API_KEY")) {
    throw new Error(failures.length
      ? `${failures.join("; ")}. GEMINI_API_KEY is not configured`
      : "Neither GROQ_API_KEY nor GEMINI_API_KEY is configured");
  }

  try {
    return await geminiModelsRequest((model) =>
      geminiRequest(`${model}:generateContent`, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      })
    );
  } catch (err) {
    throw new Error(`${failures.length ? `${failures.join("; ")}. ` : ""}${(err as Error).message}`);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function transcribeWithGemini(audio: File, prompt: string): Promise<string> {
  if (!Deno.env.get("GEMINI_API_KEY")) {
    throw new Error("GEMINI_API_KEY is not configured for speech-to-text fallback");
  }
  const audioData = bytesToBase64(new Uint8Array(await audio.arrayBuffer()));
  return await geminiModelsRequest((model) =>
    geminiRequest(`${model}:generateContent`, {
      contents: [{
        role: "user",
        parts: [
          { text: `${prompt}\nTranscribe the audio exactly. Return only the spoken words, without explanations.` },
          { inlineData: { mimeType: audio.type || "audio/webm", data: audioData } },
        ],
      }],
      generationConfig: { temperature: 0 },
    })
  );
}
