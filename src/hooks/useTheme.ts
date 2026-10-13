import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "budgetApp.theme";
const META_COLORS: Record<Theme, string> = { light: "#F5EFE6", dark: "#1D1814" };

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const systemTheme = (): Theme =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** What to show right now: the user's saved choice, otherwise the device setting. */
export const initialTheme = (): Theme => stored() ?? systemTheme();

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META_COLORS[theme]);
}

/**
 * Light/dark theme. Starts from the saved choice (or the device setting), persists changes, and
 * follows the device setting live until the user picks one themselves.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => {
      if (!stored()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode etc.: the choice just won't persist */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
