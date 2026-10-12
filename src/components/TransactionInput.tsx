import { useRef, useState } from "react";
import { canRecord, startRecording, type Recording } from "../lib/recorder";
import {
  parseTransactionAudio,
  parseTransactionText,
  saveTransactions,
  localToday,
  type ParseResult,
  type TxnType,
} from "../lib/transactions";
import type { Category } from "../hooks/useCategories";

interface Props {
  categories: Category[];
  onSaved: () => Promise<void> | void;
}

type Status = "idle" | "recording" | "thinking" | "saving";

const NEW = "__new__";
const NONE = "__none__";

interface Draft {
  type: TxnType;
  amount: string;
  date: string;
  party: string;
  /** A category id, NEW (create one) or NONE. */
  categoryChoice: string;
  newCategory: string;
}

interface Review {
  drafts: Draft[];
  rawText: string;
  heard?: string;
}

function toReview(res: ParseResult): Review {
  return {
    rawText: res.text,
    heard: res.transcript,
    drafts: res.transactions.map((p) => ({
      type: p.type,
      amount: p.amount != null ? String(p.amount) : "",
      date: p.date,
      party: p.party ?? "",
      categoryChoice: p.category ? p.category.id : p.new_category ? NEW : NONE,
      newCategory: p.new_category ?? "",
    })),
  };
}

const parseAmount = (s: string) => Number(s.replace(/,/g, ""));
const isValid = (d: Draft) =>
  Number.isFinite(parseAmount(d.amount)) &&
  parseAmount(d.amount) > 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
  !(d.categoryChoice === NEW && !d.newCategory.trim());

export default function TransactionInput({ categories, onSaved }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const recording = useRef<Recording | null>(null);
  const micAvailable = canRecord();
  const busy = status !== "idle";

  function reset() {
    setReview(null);
    setText("");
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setError(null);
    setNotice(null);
    setStatus("thinking");
    try {
      setReview(toReview(await parseTransactionText(text)));
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
      setReview(toReview(await parseTransactionAudio(blob)));
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

  const updateAt = (i: number, patch: Partial<Draft>) =>
    setReview((r) => (r ? { ...r, drafts: r.drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)) } : r));

  function removeAt(i: number) {
    setReview((r) => {
      if (!r) return r;
      const drafts = r.drafts.filter((_, j) => j !== i);
      return drafts.length ? { ...r, drafts } : null;
    });
  }

  const count = review?.drafts.length ?? 0;
  const allValid = !!review && review.drafts.every(isValid);

  async function save() {
    if (!review || !allValid || status !== "idle") return;
    setError(null);
    setStatus("saving");
    try {
      await saveTransactions(
        review.drafts.map((d) => {
          const existing = d.categoryChoice !== NEW && d.categoryChoice !== NONE;
          return {
            type: d.type,
            date: d.date,
            amount: parseAmount(d.amount),
            party: d.party.trim() || null,
            categoryId: existing ? d.categoryChoice : null,
            newCategory: d.categoryChoice === NEW ? d.newCategory.trim() : null,
            rawText: review.rawText || null,
          };
        }),
      );
      await onSaved();
      setNotice(`Saved ${count} ${count === 1 ? "transaction" : "transactions"} ✓`);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="card">
      <h2>Add transactions</h2>
      <p className="hint">
        Type or tap the mic, in English or Hindi. You can say several at once, like{" "}
        <em>“15 sep Akhil 500rs, Ramesh 200 and Swiggy 350”</em>.
      </p>

      <form className="input-row" onSubmit={submitText}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 15 sep Akhil 500rs, Swiggy 350"
          disabled={busy}
          aria-label="Transactions"
        />
        <button className="btn primary" disabled={!text.trim() || busy}>
          Add
        </button>
        {micAvailable && (
          <button
            type="button"
            className={`mic ${status === "recording" ? "active" : ""}`}
            onClick={toggleMic}
            disabled={status === "thinking" || status === "saving"}
            aria-label={status === "recording" ? "Stop recording" : "Start voice input"}
            title={status === "recording" ? "Tap to stop" : "Tap to speak"}
          >
            {status === "recording" ? "■" : "🎤"}
          </button>
        )}
      </form>

      {status === "recording" && <p className="info">Listening... tap ■ when you're done.</p>}
      {status === "thinking" && <p className="info">Working it out...</p>}
      {!micAvailable && <p className="hint">Voice input isn't available on this device, so typing only.</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {review && (
        <div className="confirm">
          {review.heard && (
            <p className="hint">
              You said: <em>“{review.heard}”</em>
            </p>
          )}
          <h3>
            {count === 1 ? "Check before saving" : `Found ${count} transactions. Check before saving`}
          </h3>

          {review.drafts.map((d, i) => (
            <div className="txn-draft" key={i}>
              <div className="txn-draft-head">
                <div className="type-toggle" role="group" aria-label={`Debit or credit for transaction ${i + 1}`}>
                  <button type="button" className={d.type === "debit" ? "on debit" : ""} onClick={() => updateAt(i, { type: "debit" })}>
                    ↑ Debit
                  </button>
                  <button type="button" className={d.type === "credit" ? "on credit" : ""} onClick={() => updateAt(i, { type: "credit" })}>
                    ↓ Credit
                  </button>
                </div>
                {count > 1 && (
                  <button type="button" className="icon-btn" aria-label={`Remove transaction ${i + 1}`} onClick={() => removeAt(i)}>
                    ✕
                  </button>
                )}
              </div>

              <div className="fields">
                <label>
                  Amount (₹)
                  <input
                    inputMode="decimal"
                    value={d.amount}
                    onChange={(e) => updateAt(i, { amount: e.target.value })}
                    placeholder="0"
                    aria-invalid={!(parseAmount(d.amount) > 0)}
                  />
                </label>
                <label>
                  Date
                  <input type="date" max={localToday()} value={d.date} onChange={(e) => updateAt(i, { date: e.target.value })} />
                </label>
                <label className="wide">
                  {d.type === "debit" ? "Paid to" : "Received from"}
                  <input value={d.party} onChange={(e) => updateAt(i, { party: e.target.value })} placeholder="e.g. Akhil" />
                </label>
                <label className="wide">
                  Category
                  <select value={d.categoryChoice} onChange={(e) => updateAt(i, { categoryChoice: e.target.value })}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value={NEW}>＋ New category...</option>
                    <option value={NONE}>No category</option>
                  </select>
                </label>
                {d.categoryChoice === NEW && (
                  <label className="wide">
                    New category name
                    <input
                      value={d.newCategory}
                      onChange={(e) => updateAt(i, { newCategory: e.target.value })}
                      placeholder="e.g. Friends & Family"
                    />
                  </label>
                )}
              </div>
              {!(parseAmount(d.amount) > 0) && <p className="error">Enter an amount greater than 0.</p>}
            </div>
          ))}

          <div className="actions">
            <button className="btn primary" onClick={save} disabled={!allValid || status !== "idle"}>
              {status === "saving" ? "Saving..." : count === 1 ? "Save" : `Save all ${count}`}
            </button>
            <button className="btn ghost" onClick={reset} disabled={status === "saving"}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
