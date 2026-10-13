import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_RECORD_MS } from "../lib/recorder";
import MicIcon from "./MicIcon";

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
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-labelledby="voice-title">
      <div className={`voice-orb ${recording ? "live" : "busy"}`} aria-hidden="true">
        {recording ? <MicIcon size={64} /> : <span className="voice-spinner" />}
      </div>

      <div aria-live="polite">
        <h2 id="voice-title">{recording ? "Recording…" : "Processing…"}</h2>
        {recording ? (
          <>
            <p className="voice-timer">
              {mmss(elapsed)} <span>/ {mmss(MAX_RECORD_MS)}</span>
            </p>
            <p className="voice-sub">Say your transactions, then tap stop.</p>
          </>
        ) : (
          <p className="voice-sub">
            {elapsed >= SLOW_MS
              ? "Still working on it, almost there…"
              : "Working out the amounts, dates and categories."}
          </p>
        )}
      </div>

      {recording ? (
        <button type="button" className="voice-stop" onClick={onStop} autoFocus>
          ■ Stop recording
        </button>
      ) : null}
      <button type="button" className="voice-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>,
    document.body,
  );
}
