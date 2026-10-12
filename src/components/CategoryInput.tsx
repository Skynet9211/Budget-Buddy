import { useRef, useState } from "react";
import { canRecord, startRecording, type Recording } from "../lib/recorder";
import { extractFromAudio, extractFromText } from "../lib/extractCategories";
import { normalizeName } from "../lib/categories";

interface Props {
  existing: string[];
  onSave: (names: string[]) => Promise<number>;
}

type Status = "idle" | "recording" | "thinking";

export default function CategoryInput({ existing, onSave }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const recording = useRef<Recording | null>(null);
  const micAvailable = canRecord();

  function reset() {
    setSuggestions(null);
    setTranscript(null);
    setText("");
  }

  function handleResult(categories: string[], said?: string) {
    setTranscript(said ?? null);
    if (!categories.length) {
      setNotice(null);
      setError(
        said
          ? `Heard "${said}", but found no new categories. Try again.`
          : "No new categories found (they may already exist).",
      );
      setSuggestions(null);
      return;
    }
    setSuggestions(categories);
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || status !== "idle") return;
    setError(null);
    setNotice(null);
    setStatus("thinking");
    try {
      const res = await extractFromText(text, existing);
      handleResult(res.categories);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus("idle");
    }
  }

  async function finishRecording() {
    const rec = recording.current;
    if (!rec) return;
    recording.current = null;
    setStatus("thinking");
    try {
      const blob = await rec.stop();
      if (blob.size < 1000) throw new Error("Didn't catch anything. Please try again.");
      const res = await extractFromAudio(blob, existing);
      handleResult(res.categories, res.transcript);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus("idle");
    }
  }

  async function toggleMic() {
    setError(null);
    setNotice(null);
    if (status === "recording") return finishRecording();
    if (status !== "idle") return;
    try {
      recording.current = await startRecording(() => void finishRecording());
      setStatus("recording");
    } catch {
      setError("Microphone access was denied. Allow it in your settings, or type instead.");
    }
  }

  async function confirm() {
    if (!suggestions) return;
    const names = suggestions.map(normalizeName).filter(Boolean);
    const added = await onSave(names);
    setNotice(added ? `Added ${added} ${added === 1 ? "category" : "categories"} ✓` : "Nothing new to add.");
    reset();
  }

  return (
    <section className="card">
      <h2>Add categories</h2>
      <p className="hint">
        Type or tap the mic and say things like <em>“groceries, petrol and eating out”</em>.
      </p>

      <form className="input-row" onSubmit={submitText}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Groceries, Rent, Netflix"
          disabled={status !== "idle"}
          aria-label="Category names"
        />
        <button className="btn primary" disabled={!text.trim() || status !== "idle"}>
          Add
        </button>
        {micAvailable && (
          <button
            type="button"
            className={`mic ${status === "recording" ? "active" : ""}`}
            onClick={toggleMic}
            disabled={status === "thinking"}
            aria-label={status === "recording" ? "Stop recording" : "Start voice input"}
            title={status === "recording" ? "Tap to stop" : "Tap to speak"}
          >
            {status === "recording" ? "■" : "🎤"}
          </button>
        )}
      </form>

      {status === "recording" && <p className="info">Listening... tap ■ when you're done.</p>}
      {status === "thinking" && <p className="info">Working on it...</p>}
      {!micAvailable && <p className="hint">Voice input isn't available on this device, so typing only.</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {suggestions && (
        <div className="confirm">
          {transcript && (
            <p className="hint">
              You said: <em>“{transcript}”</em>
            </p>
          )}
          <h3>Check before saving</h3>
          <ul>
            {suggestions.map((s, i) => (
              <li key={i}>
                <input
                  value={s}
                  onChange={(e) => setSuggestions(suggestions.map((v, j) => (j === i ? e.target.value : v)))}
                  aria-label={`Category ${i + 1}`}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${s}`}
                  onClick={() => {
                    const next = suggestions.filter((_, j) => j !== i);
                    setSuggestions(next.length ? next : null);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button className="btn primary" onClick={confirm}>
              Save {suggestions.length > 1 ? "all" : ""}
            </button>
            <button className="btn ghost" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
