import { useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, buildVars, getPalette, isPaletteId, type Mode, type Resolved } from "../lib/themes";

export type { Mode, Resolved } from "../lib/themes";

export interface ThemeState {
  /** What the user picked: light, dark, or follow the device. */
  mode: Mode;
  palette: string;
  /** The mode actually on screen (`system` resolved to light or dark). */
  resolved: Resolved;
}

// "budgetApp.theme" already held "light" | "dark" from the old toggle, so existing choices carry over.
const MODE_KEY = "budgetApp.theme";
const PALETTE_KEY = "budgetApp.palette";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc.: the choice just won't persist */
  }
}

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");
const resolve = (mode: Mode): Resolved =>
  mode === "system" ? (darkQuery()?.matches ? "dark" : "light") : mode;

function load(): ThemeState {
  const m = read(MODE_KEY);
  const mode: Mode = m === "light" || m === "dark" || m === "system" ? m : "system";
  const p = read(PALETTE_KEY);
  return { mode, palette: isPaletteId(p) ? p : DEFAULT_PALETTE, resolved: resolve(mode) };
}

let state: ThemeState = load();
const listeners = new Set<() => void>();

function apply(s: ThemeState) {
  const root = document.documentElement;
  const vars = buildVars(getPalette(s.palette), s.resolved);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.dataset.theme = s.resolved; // drives color-scheme (form controls, scrollbars)
  root.dataset.palette = s.palette;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", vars["--bg"]);
}

function update(next: ThemeState) {
  if (next.mode === state.mode && next.palette === state.palette && next.resolved === state.resolved) return;
  state = next;
  apply(state);
  listeners.forEach((l) => l());
}

let started = false;

/** Call once before the first render: paints the saved theme and follows the device setting. */
export function initTheme() {
  apply(state);
  if (started) return;
  started = true;
  darkQuery()?.addEventListener("change", () => {
    if (state.mode === "system") update({ ...state, resolved: resolve("system") });
  });
  // Another tab/window changed the theme: follow it.
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === MODE_KEY || e.key === PALETTE_KEY) update(load());
  });
}

export function setMode(mode: Mode) {
  write(MODE_KEY, mode);
  update({ ...state, mode, resolved: resolve(mode) });
}

export function setPalette(palette: string) {
  if (!isPaletteId(palette)) return;
  write(PALETTE_KEY, palette);
  update({ ...state, palette });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useTheme() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, setMode, setPalette };
}
