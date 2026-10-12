export const MAX_NAME_LENGTH = 40;

/** Trim, collapse spaces, and capitalise the first letter ("eating  out" -> "Eating out"). */
export function normalizeName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function isDuplicate(name: string, existing: string[]): boolean {
  const key = name.trim().toLowerCase();
  return existing.some((e) => e.trim().toLowerCase() === key);
}

/**
 * Clean a list of suggested names (e.g. from the AI): normalise, drop empties,
 * drop duplicates (case-insensitive), and optionally drop ones that already exist.
 */
export function cleanSuggestions(raw: unknown, existing: string[] = []): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(existing.map((e) => e.trim().toLowerCase()));
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const name = normalizeName(item);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Local fallback if the AI is unavailable: split on commas, "and", "&", new lines. */
export function splitLocally(text: string): string[] {
  const parts = text
    .replace(/\b(please\s+)?(add|create|new category|new categories|categories|category)\b/gi, " ")
    .split(/,|\band\b|&|\n|;/i);
  return cleanSuggestions(parts);
}

const EMOJI_RULES: Array<[RegExp, string]> = [
  [/grocer|supermarket|vegetable|fruit|food shop|bigbasket|blinkit|zepto|instamart|dmart/, "🛒"],
  [/eat|restaurant|dining|dine|takeaway|takeout|cafe|coffee|snack|lunch|dinner|swiggy|zomato|dominos|mcdonald|kfc|starbucks/, "🍽️"],
  [/transport|fuel|petrol|gas|diesel|taxi|uber|\bola\b|rapido|bus|metro|train|commute|parking|irctc/, "🚗"],
  [/amazon|flipkart|myntra|meesho|ajio|nykaa/, "📦"],
  [/google pay|gpay|phonepe|paytm|upi/, "💳"],
  [/rent|mortgage|housing|home|house/, "🏠"],
  [/electric|water|utilit|internet|wifi|phone|mobile|bill/, "💡"],
  [/health|medic|doctor|pharma|hospital|gym|fitness/, "💊"],
  [/movie|netflix|entertain|game|music|spotify|stream|fun/, "🎬"],
  [/shop|cloth|fashion|shoe|apparel/, "🛍️"],
  [/travel|trip|vacation|holiday|flight|hotel/, "✈️"],
  [/educat|school|course|book|tuition|college/, "📚"],
  [/gift|donat|charity/, "🎁"],
  [/pet|dog|cat/, "🐾"],
  [/kid|child|baby/, "🧸"],
  [/insur/, "🛡️"],
  [/saving|invest/, "💰"],
];

export function emojiFor(name: string): string {
  const n = name.toLowerCase();
  for (const [re, emoji] of EMOJI_RULES) if (re.test(n)) return emoji;
  return "🏷️";
}
