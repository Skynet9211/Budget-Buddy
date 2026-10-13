import { useCallback, useEffect, useRef, useState } from "react";
import MicIcon from "./MicIcon";
import VoiceOverlay from "./VoiceOverlay";
import { canRecord, startRecording, type Recording } from "../lib/recorder";
import {
  parseTransactionAudio,
  parseTransactionText,
  saveTransactions,
  addTransactionCategories,
  localToday,
  type ParseResult,
  type TxnType,
} from "../lib/transactions";
import type { Category } from "../hooks/useCategories";

interface Props {
  categories: Category[];
  onSaved: () => Promise<void> | void;
  /** Called with true while there is parsed data waiting to be edited/saved, false otherwise. */
  onReviewChange?: (active: boolean) => void;
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
  /** Additional existing categories the transaction also belongs to. */
  extraIds: string[];
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
      extraIds: [],
    })),
  };
}

const parseAmount = (s: string) => Number(s.replace(/,/g, ""));
const isValid = (d: Draft) =>
  Number.isFinite(parseAmount(d.amount)) &&
  parseAmount(d.amount) > 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
  !(d.categoryChoice === NEW && !d.newCategory.trim());

export default function TransactionInput({ categories, onSaved, onReviewChange }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  /** True from the moment the mic starts until its result is shown. Drives the full-screen overlay. */
  const [viaVoice, setViaVoice] = useState(false);
  const recording = useRef<Recording | null>(null);
  /** Bumped on every voice job and on cancel, so a cancelled job's late result is ignored. */
  const job = useRef(0);
  const micAvailable = canRecord();
  const busy = status !== "idle";
  const reviewing = review !== null;

  // Tell the parent when there's data to review, so it can hide the lists until it's saved.
  useEffect(() => {
    onReviewChange?.(reviewing);
  }, [reviewing, onReviewChange]);
  useEffect(
    () => () => {
      onReviewChange?.(false);
      recording.current?.cancel(); // never leave the microphone on if this screen goes away
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    const mine = ++job.current;
    setStatus("thinking"); // the overlay switches from "Recording…" to "Processing…"
    try {
      const blob = await rec.stop();
      if (blob.size < 1000) throw new Error("Didn't catch anything. Please try again.");
      const result = await parseTransactionAudio(blob);
      if (mine === job.current) setReview(toReview(result));
    } catch (err) {
      if (mine === job.current) setError((err as Error).message);
    } finally {
      if (mine === job.current) {
        setStatus("idle");
        setViaVoice(false); // overlay closes: either the review form or an error is now showing
      }
    }
  }

  /** Cancels a live recording, or abandons one that's still being processed. */
  const cancelVoice = useCallback(() => {
    job.current++; // a late result from the abandoned job is ignored
    recording.current?.cancel();
    recording.current = null;
    setStatus("idle");
    setViaVoice(false);
  }, []);

  async function toggleMic() {
    setError(null);
    setNotice(null);
    if (status !== "idle") return;
    try {
      recording.current = await startRecording(() => void finishRecording());
      setStatus("recording");
      setViaVoice(true);
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
      const ids = await saveTransactions(
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
      // Ids come back in the same order as the drafts. Attach any extra categories.
      try {
        await Promise.all(
          review.drafts.map((d, i) => addTransactionCategories(ids[i], d.extraIds.filter((id) => id !== d.categoryChoice))),
        );
      } catch (err) {
        await onSaved();
        reset();
        throw new Error(`Saved, but couldn't add the extra categories: ${(err as Error).message}`);
      }
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
      <h2>{reviewing ? "Review transactions" : "Add transactions"}</h2>

      {/* While there's parsed data to edit/save, the input is hidden so the review has the focus. */}
      {!reviewing && (
        <>
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
                className="mic"
                onClick={toggleMic}
                disabled={busy}
                aria-label="Start voice input"
                title="Tap to speak"
              >
                <MicIcon size={26} />
              </button>
            )}
          </form>

          {/* Voice progress is shown by the full-screen overlay; typed input has no overlay. */}
          {status === "thinking" && !viaVoice && <p className="info">Working it out...</p>}
          {!micAvailable && <p className="hint">Voice input isn't available on this device, so typing only.</p>}
        </>
      )}

      {viaVoice && (status === "recording" || status === "thinking") && (
        <VoiceOverlay
          phase={status === "recording" ? "recording" : "processing"}
          onStop={() => void finishRecording()}
          onCancel={cancelVoice}
        />
      )}

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
                {categories.length > 1 && (
                  <div className="wide also-in">
                    <span className="also-in-label">Also in (optional)</span>
                    <div className="chip-row">
                      {categories
                        .filter((c) => c.id !== d.categoryChoice)
                        .map((c) => {
                          const on = d.extraIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`chip ${on ? "on" : ""}`}
                              aria-pressed={on}
                              onClick={() =>
                                updateAt(i, {
                                  extraIds: on ? d.extraIds.filter((id) => id !== c.id) : [...d.extraIds, c.id],
                                })
                              }
                            >
                              {c.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
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
