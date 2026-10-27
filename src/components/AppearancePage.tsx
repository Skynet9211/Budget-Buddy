import { useEffect, useRef, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useAppearanceOpen, useCloseAppearance } from "../hooks/useAppearanceRoute";
import { useTheme, type Mode } from "../hooks/useTheme";
import { PALETTES } from "../lib/themes";

const MODES: { id: Mode; label: string; hint: string; icon: ReactElement }[] = [
  {
    id: "light",
    label: "Light",
    hint: "Always light",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    id: "dark",
    label: "Dark",
    hint: "Always dark",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    id: "system",
    label: "System",
    hint: "Match device",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
];

/** Full-screen page for choosing light/dark mode and a colour theme. Opened from the floating button. */
export default function AppearancePage() {
  const open = useAppearanceOpen();
  const closeAppearance = useCloseAppearance();
  const { mode, palette, resolved, setMode, setPalette } = useTheme();
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    backRef.current?.focus();
    // Keep keyboard focus and screen readers on the page, not the app behind it.
    const app = document.getElementById("root");
    app?.setAttribute("inert", "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAppearance();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      app?.removeAttribute("inert");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeAppearance]);

  if (!open) return null;

  // Portalled to <body> so the app root can be made inert while the page is open.
  return createPortal(
    <div className="appearance" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <div className="appearance-inner">
        <header className="appearance-head">
          <button ref={backRef} type="button" className="icon-btn appearance-back" onClick={closeAppearance} aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <h1 id="appearance-title">Appearance</h1>
            <p className="subtitle">Pick a mode and a colour theme.</p>
          </div>
        </header>

        <section className="card">
          <h2>Mode</h2>
          <fieldset className="opt-group modes">
            <legend className="sr-only">Theme mode</legend>
            {MODES.map((m) => (
              <label key={m.id} className="opt">
                <input type="radio" name="mode" className="sr-only" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span className="opt-box mode-box">
                  {m.icon}
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card">
          <h2>Colour theme</h2>
          <fieldset className="opt-group palettes">
            <legend className="sr-only">Colour theme</legend>
            {PALETTES.map((p) => {
              const c = p[resolved]; // preview in the mode that is currently on screen
              return (
                <label key={p.id} className="opt">
                  <input type="radio" name="palette" className="sr-only" checked={palette === p.id} onChange={() => setPalette(p.id)} />
                  <span className="opt-box palette-box">
                    <span className="swatch" style={{ background: c.bg, borderColor: c.border }} aria-hidden="true">
                      <span className="swatch-card" style={{ background: c.card, borderColor: c.border }}>
                        <span className="swatch-line" style={{ background: c.text }} />
                        <span className="swatch-line short" style={{ background: c.muted }} />
                      </span>
                      <span className="swatch-dot" style={{ background: c.accent }} />
                    </span>
                    <strong>{p.name}</strong>
                    <span className="opt-check" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>

        <section className="card appearance-preview">
          <h2>Preview</h2>
          <p className="hint">This is how buttons, tags and amounts will look.</p>
          <div className="actions">
            <button type="button" className="btn primary">Primary</button>
            <button type="button" className="btn ghost">Secondary</button>
          </div>
          <div className="chip-row" style={{ marginTop: "0.8rem" }}>
            <span className="chip on">Groceries</span>
            <span className="chip">Travel</span>
            <span className="debit">-₹450</span>
            <span className="credit">+₹1,200</span>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
