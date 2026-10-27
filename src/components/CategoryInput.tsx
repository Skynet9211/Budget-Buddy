import { useRef, useState } from "react";
import { canRecord, startRecording, type Recording } from "../lib/recorder";
import { extractFromAudio, extractFromText } from "../lib/extractCategories";
import { normalizeName } from "../lib/categories";
import MicButton from "./MicButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Message } from "@/components/ui/message";

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
    <Card>
      <h2>Add categories</h2>
      <Message>
        Type or tap the mic and say things like <em>“groceries, petrol and eating out”</em>.
      </Message>

      <form className="mt-3 flex items-center gap-2" onSubmit={submitText}>
        <Input
          type="text"
          value={text}
          onChange={setText}
          placeholder="e.g. Groceries, Rent, Netflix"
          ariaLabel="Category names"
          onSubmit={submitText}
          disabled={status !== "idle"}
          micAvailable={micAvailable}
          micActive={status === "recording"}
          onMicClick={toggleMic}
          micDisabled={status === "thinking"}
        />
        <Button disabled={!text.trim() || status !== "idle"}>Add</Button>
        {micAvailable && (
          <MicButton
            live={status === "recording"}
            onClick={toggleMic}
            disabled={status === "thinking"}
            aria-label={status === "recording" ? "Stop recording" : "Start voice input"}
            title={status === "recording" ? "Tap to stop" : "Tap to speak"}
          >
            {status === "recording" ? "■" : "🎤"}
          </MicButton>
        )}
      </form>

      {status === "recording" && <Message kind="info">Listening... tap ■ when you're done.</Message>}
      {status === "thinking" && <Message kind="info">Working on it...</Message>}
      {!micAvailable && <Message>Voice input isn't available on this device, so typing only.</Message>}
      {error && <Message kind="error">{error}</Message>}
      {notice && <Message kind="success">{notice}</Message>}

      {suggestions && (
        <div className="mt-3 border-t border-dashed pt-2.5">
          {transcript && (
            <Message>
              You said: <em>“{transcript}”</em>
            </Message>
          )}
          <h3>Check before saving</h3>
          <ul className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Input
                  value={s}
                  onChange={(e) => setSuggestions(suggestions.map((v, j) => (j === i ? e.target.value : v)))}
                  aria-label={`Category ${i + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${s}`}
                  onClick={() => {
                    const next = suggestions.filter((_, j) => j !== i);
                    setSuggestions(next.length ? next : null);
                  }}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button onClick={confirm}>Save {suggestions.length > 1 ? "all" : ""}</Button>
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
