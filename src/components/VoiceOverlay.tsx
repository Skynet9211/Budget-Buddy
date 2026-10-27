import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_RECORD_MS } from "../lib/recorder";
import MicIcon from "./MicIcon";
import { cn } from "@/lib/utils";

interface Props {
  /** "recording": mic is live. "processing": audio is being turned into transactions. */
  phase: "recording" | "processing";
  onStop: () => void;
  onCancel: () => void;
}

const mmss = (ms: number) => {
  const s = Math.min(Math.floor(ms / 1000), 99 * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** After this long in "processing" we reassure the user that it's still working. */
const SLOW_MS = 8000;

/**
 * Full-screen overlay for voice input. It blocks the rest of the app while the mic is live and
 * while the recording is being processed, so the user always knows what state the app is in.
 */
export default function VoiceOverlay({ phase, onStop, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(0);

  // Restart the clock whenever the phase changes (recording timer, then "still working" timer).
  useEffect(() => {
    const start = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Date.now() - start), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Lock page scroll behind the overlay, and let Escape cancel.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const recording = phase === "recording";

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-[1.4rem] bg-[rgba(60,46,35,0.94)] px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-white backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-title"
    >
      <div
        className={cn(
          "grid size-[132px] place-items-center rounded-full text-[3.2rem]",
          recording ? "animate-voice-pulse bg-destructive motion-reduce:animate-none" : "bg-primary",
        )}
        aria-hidden="true"
      >
        {recording ? (
          <MicIcon size={64} />
        ) : (
          <span className="size-[52px] animate-[spin_0.9s_linear_infinite] rounded-full border-[5px] border-white/30 border-t-white motion-reduce:animate-none" />
        )}
      </div>

      <div aria-live="polite">
        <h2 id="voice-title" className="m-0 justify-center text-[1.6rem] text-white">
          {recording ? "Recording…" : "Processing…"}
        </h2>
        {recording ? (
          <>
            <p className="mt-2 text-[1.4rem] font-extrabold tabular-nums">
              {mmss(elapsed)} <span className="text-base font-semibold text-white/55">/ {mmss(MAX_RECORD_MS)}</span>
            </p>
            <p className="mt-1.5 text-white/80">Say your transactions, then tap stop.</p>
          </>
        ) : (
          <p className="mt-1.5 text-white/80">
            {elapsed >= SLOW_MS
              ? "Still working on it, almost there…"
              : "Working out the amounts, dates and categories."}
          </p>
        )}
      </div>

      {recording ? (
        <button
          type="button"
          className="min-h-[58px] rounded-full bg-white px-8 text-[1.1rem] font-extrabold text-destructive shadow-[0_6px_20px_rgba(0,0,0,0.25)] active:scale-[0.97]"
          onClick={onStop}
          autoFocus
        >
          ■ Stop recording
        </button>
      ) : null}
      <button type="button" className="min-h-11 px-4 font-bold text-white/80 underline" onClick={onCancel}>
        Cancel
      </button>
    </div>,
    document.body,
  );
}
