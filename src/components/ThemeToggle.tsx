import { useAppearanceOpen, useOpenAppearance } from "../hooks/useAppearanceRoute";

/** Floating action button that opens the Appearance page (mode + colour theme). */
export default function ThemeToggle() {
  const open = useAppearanceOpen();
  const openAppearance = useOpenAppearance();
  if (open) return null;

  return (
    <button
      type="button"
      className="group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] z-[900] grid size-14 place-items-center rounded-full bg-primary p-0 text-primary-foreground shadow-fab transition-[background-color,box-shadow,transform] duration-200 hover:bg-primary-hover hover:shadow-fab-hover focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-heading active:scale-[0.94] motion-reduce:transition-none"
      onClick={openAppearance}
      aria-label="Appearance settings"
      title="Appearance"
    >
      {/* Sliders: "configure" */}
      <svg
        className="transition-transform duration-300 group-hover:rotate-20 motion-reduce:transition-none"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" fill="currentColor" />
        <circle cx="9" cy="17" r="2.2" fill="currentColor" />
      </svg>
    </button>
  );
}
