import { useEffect, useRef, type JSX } from "react";
import { createPortal } from "react-dom";
import { useAppearanceOpen, useCloseAppearance } from "../hooks/useAppearanceRoute";
import { useTheme, type Mode } from "../hooks/useTheme";
import { PALETTES } from "../lib/themes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import { Page } from "@/components/ui/page";
import { RadioGroup, RadioGroupCard, RadioGroupIndicator } from "@/components/ui/radio-group";
import { segmentedItemVariants } from "@/components/ui/segmented";

const MODES: { id: Mode; label: string; hint: string; icon: JSX.Element }[] = [
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
    <div
      className="fixed inset-0 z-[1100] animate-appear-in overflow-y-auto bg-background motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appearance-title"
    >
      <Page className="pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2.5">
          <Button
            ref={backRef}
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full bg-secondary text-heading"
            onClick={closeAppearance}
            aria-label="Back"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Button>
          <div>
            <h1 id="appearance-title">Appearance</h1>
            <Message>Pick a mode and a colour theme.</Message>
          </div>
        </header>

        <Card>
          <h2>Mode</h2>
          <RadioGroup
            className="mt-1.5 grid-cols-3 gap-2.5"
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            aria-label="Theme mode"
          >
            {MODES.map((m) => (
              <RadioGroupCard key={m.id} value={m.id}>
                <span className="text-heading">{m.icon}</span>
                <strong>{m.label}</strong>
                <small className="text-xs text-muted-foreground">{m.hint}</small>
              </RadioGroupCard>
            ))}
          </RadioGroup>
        </Card>

        <Card>
          <h2>Colour theme</h2>
          <RadioGroup
            className="mt-1.5 grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5"
            value={palette}
            onValueChange={setPalette}
            aria-label="Colour theme"
          >
            {PALETTES.map((p) => {
              const c = p[resolved]; // preview in the mode that is currently on screen
              return (
                <RadioGroupCard key={p.id} value={p.id}>
                  <span
                    className="relative block h-16 w-full overflow-hidden rounded-sm border"
                    style={{ background: c.bg, borderColor: c.border }}
                    aria-hidden="true"
                  >
                    <span
                      className="absolute inset-y-2 right-[26px] left-2 flex flex-col justify-center gap-[5px] rounded-[7px] border px-[7px]"
                      style={{ background: c.card, borderColor: c.border }}
                    >
                      <span className="block h-[5px] rounded-[3px] opacity-85" style={{ background: c.text }} />
                      <span className="block h-[5px] w-[55%] rounded-[3px] opacity-85" style={{ background: c.muted }} />
                    </span>
                    <span className="absolute right-1.5 bottom-2 size-3.5 rounded-full" style={{ background: c.accent }} />
                  </span>
                  <strong>{p.name}</strong>
                  <RadioGroupIndicator
                    className="absolute top-1.5 right-1.5 grid size-[22px] place-items-center rounded-full bg-primary text-primary-foreground"
                    aria-hidden="true"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  </RadioGroupIndicator>
                </RadioGroupCard>
              );
            })}
          </RadioGroup>
        </Card>

        <Card>
          <h2>Preview</h2>
          <Message>This is how buttons, tags and amounts will look.</Message>
          <div className="mt-3 flex gap-2">
            <Button type="button">Primary</Button>
            <Button type="button" variant="secondary">
              Secondary
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span data-state="on" className={segmentedItemVariants({ variant: "chip" })}>
              Groceries
            </span>
            <span className={segmentedItemVariants({ variant: "chip" })}>Travel</span>
            <span className="text-destructive">-₹450</span>
            <span className="text-credit">+₹1,200</span>
          </div>
        </Card>
      </Page>
    </div>,
    document.body,
  );
}
