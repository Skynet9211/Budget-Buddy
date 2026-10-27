/**
 * Colour palettes. Each one has a light and a dark variant; the "mode" (light / dark / system)
 * decides which variant is shown. Values are applied as CSS variables on <html> (see useTheme).
 */

export type Mode = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

/** The colours that differ between palettes. */
export interface Core {
  bg: string;
  card: string;
  border: string;
  accent: string;
  /** Headings and text on tinted surfaces: darker in light mode, lighter in dark mode. */
  accentDark: string;
  text: string;
  muted: string;
  tint: string;
  /** Inputs, list rows, nested panels. */
  surface2: string;
}

export interface Palette {
  id: string;
  name: string;
  light: Core;
  dark: Core;
}

/** Money colours stay the same across palettes so debit/credit always read as red/green. */
const SEMANTIC: Record<Resolved, Record<"success" | "error" | "debitBg" | "creditBg" | "credit", string>> = {
  light: { success: "#7d9b76", error: "#c0604a", debitBg: "#f6e1db", creditBg: "#e3ecde", credit: "#5f7f58" },
  dark: { success: "#8fb287", error: "#e5836d", debitBg: "#4a2a23", creditBg: "#2b3a27", credit: "#9bc193" },
};

export const PALETTES: Palette[] = [
  {
    id: "mocha",
    name: "Mocha",
    light: { bg: "#f5efe6", card: "#fbf7f0", border: "#e4d8c6", accent: "#b08968", accentDark: "#8c6a4a", text: "#4a3b2e", muted: "#8a7766", tint: "#efe3d2", surface2: "#fff9f0" },
    dark: { bg: "#1d1814", card: "#29221c", border: "#40362c", accent: "#b08968", accentDark: "#e2c3a4", text: "#f0e7dc", muted: "#a99b8c", tint: "#3a3027", surface2: "#332b23" },
  },
  {
    id: "ocean",
    name: "Ocean",
    light: { bg: "#eef4f8", card: "#f8fbfd", border: "#d3e2ec", accent: "#2f7fa8", accentDark: "#1f5f82", text: "#1f3340", muted: "#5f7a8a", tint: "#dcebf4", surface2: "#f4f9fc" },
    dark: { bg: "#0f1a21", card: "#16252e", border: "#27414f", accent: "#3b8fb8", accentDark: "#9cd0ea", text: "#e4f0f6", muted: "#8fa9b8", tint: "#1f3744", surface2: "#1b2d38" },
  },
  {
    id: "forest",
    name: "Forest",
    light: { bg: "#eef3ec", card: "#f7faf5", border: "#d5e0d1", accent: "#4f8a5b", accentDark: "#356a41", text: "#243229", muted: "#66786b", tint: "#deeadb", surface2: "#fafdf8" },
    dark: { bg: "#121a14", card: "#1a251d", border: "#2c3d30", accent: "#4f8a5b", accentDark: "#a9d6b2", text: "#e4efe6", muted: "#92a897", tint: "#24352a", surface2: "#203025" },
  },
  {
    id: "lavender",
    name: "Lavender",
    light: { bg: "#f3f0f8", card: "#faf8fd", border: "#ddd5ec", accent: "#7b62b5", accentDark: "#5b4491", text: "#33294a", muted: "#7a6e94", tint: "#e6e0f2", surface2: "#fdfcff" },
    dark: { bg: "#17131f", card: "#211b2d", border: "#382f4a", accent: "#8a70c4", accentDark: "#cdbdf0", text: "#eee9f7", muted: "#a399bb", tint: "#2e2640", surface2: "#2a2239" },
  },
  {
    id: "rose",
    name: "Rosé",
    light: { bg: "#f9eff0", card: "#fdf7f7", border: "#ecd6d8", accent: "#c0566a", accentDark: "#9a3e51", text: "#4a2c33", muted: "#8f6f76", tint: "#f4dde0", surface2: "#fffafa" },
    dark: { bg: "#1e1417", card: "#2a1c20", border: "#45303a", accent: "#c9677a", accentDark: "#f0b6c1", text: "#f6e9eb", muted: "#b49ba1", tint: "#3a262c", surface2: "#34232a" },
  },
  {
    id: "sunset",
    name: "Sunset",
    light: { bg: "#fbf1e4", card: "#fffaf2", border: "#f0dcc0", accent: "#d0682b", accentDark: "#a24c18", text: "#48301f", muted: "#8f7358", tint: "#f7e2c8", surface2: "#fffcf6" },
    dark: { bg: "#1e1610", card: "#2a1e15", border: "#46331f", accent: "#d9732f", accentDark: "#f4c394", text: "#f7ebdd", muted: "#b79d82", tint: "#3a2918", surface2: "#33241a" },
  },
  {
    id: "graphite",
    name: "Graphite",
    light: { bg: "#f1f2f4", card: "#fafafb", border: "#dcdee3", accent: "#5b6578", accentDark: "#3f4756", text: "#23272f", muted: "#6b7280", tint: "#e6e8ec", surface2: "#ffffff" },
    dark: { bg: "#121316", card: "#1b1c21", border: "#2e3037", accent: "#7a869c", accentDark: "#c9d0de", text: "#eceef2", muted: "#9aa0ad", tint: "#26282f", surface2: "#22242a" },
  },
];

export const DEFAULT_PALETTE = "mocha";

/** The original Mocha category colours, kept as they were before palettes existed. */
const MOCHA_CHART = ["#b08968", "#7d9b76", "#c0604a", "#6b8fa3", "#d4a24c", "#9b7fa6", "#5e8c8a", "#c47f9a", "#8c6a4a", "#a3a86b"];

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Category colours for the donut, legend and word cloud. They start at the palette's accent and
 * step round the colour wheel, so every category stays distinct but the set matches the theme.
 */
export function chartColors(palette: Palette, resolved: Resolved, count = 10): string[] {
  if (palette.id === DEFAULT_PALETTE) return MOCHA_CHART.slice(0, count);
  const accent = palette[resolved].accent;
  const [h, s] = hexToHsl(accent);
  const sat = Math.min(0.6, Math.max(0.35, s));
  const light = resolved === "dark" ? 0.62 : 0.5; // readable on both card colours
  return Array.from({ length: count }, (_, i) => (i === 0 ? accent : hslToHex((h + i * 36) % 360, sat, light)));
}

export const isPaletteId = (v: unknown): v is string => PALETTES.some((p) => p.id === v);
export const getPalette = (id: string): Palette => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend `a` towards `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/**
 * The CSS variables for one palette in one mode. Names follow shadcn/ui's tokens (mapped to Tailwind
 * colours in src/index.css); `--heading`, `--surface`, `--primary-hover` and the money colours are ours.
 */
export function buildVars(palette: Palette, resolved: Resolved): Record<string, string> {
  const c = palette[resolved];
  const s = SEMANTIC[resolved];
  const dark = resolved === "dark";
  const [sr, sg, sb] = hexToRgb(c.accentDark);
  return {
    "--background": c.bg,
    "--foreground": c.text,
    "--card": c.card,
    "--card-foreground": c.text,
    "--popover": c.card,
    "--popover-foreground": c.text,
    "--primary": c.accent,
    "--primary-foreground": "#ffffff",
    // Hover shade for filled accent buttons: darker on light, lighter on dark, white text stays readable.
    "--primary-hover": dark ? mix(c.accent, "#ffffff", 0.15) : mix(c.accent, "#000000", 0.18),
    "--secondary": c.tint,
    "--secondary-foreground": c.accentDark,
    "--muted": c.tint,
    "--muted-foreground": c.muted,
    "--accent": c.tint,
    "--accent-foreground": c.accentDark,
    "--heading": c.accentDark,
    "--surface": c.surface2,
    "--border": c.border,
    "--input": c.border,
    "--ring": c.accent,
    "--destructive": s.error,
    "--success": s.success,
    "--debit-bg": s.debitBg,
    "--credit-bg": s.creditBg,
    "--credit": s.credit,
    "--shadow": dark ? "0 2px 10px rgba(0, 0, 0, 0.45)" : `0 2px 10px rgba(${sr}, ${sg}, ${sb}, 0.1)`,
  };
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
