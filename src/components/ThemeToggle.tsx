import { openAppearance, useAppearanceOpen } from "../hooks/useAppearanceRoute";

/** Floating action button that opens the Appearance page (mode + colour theme). */
export default function ThemeToggle() {
  const open = useAppearanceOpen();
  if (open) return null;

  return (
    <button type="button" className="theme-fab" onClick={openAppearance} aria-label="Appearance settings" title="Appearance">
      {/* Sliders: "configure" */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" fill="currentColor" />
        <circle cx="9" cy="17" r="2.2" fill="currentColor" />
      </svg>
    </button>
  );
}
