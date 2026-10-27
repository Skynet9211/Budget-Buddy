import { useCallback, useEffect, useRef, useState } from "react";
import MicIcon from "./MicIcon";
import MicButton from "./MicButton";
import VoiceOverlay from "./VoiceOverlay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Message } from "@/components/ui/message";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { DEFAULT_PAYMENT_MODE } from "../lib/paymentModes";
import type { PaymentMode } from "../types";

interface Props {
  categories: Category[];
  paymentModes: PaymentMode[];
  familyId?: string | null;
  familyMembers?: Array<{ id: string; name?: string; user_id?: string; role?: string }>;

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
  /** A payment mode id. UPI unless the note named another one. */
  paymentMode: string;
  /** A category id, NEW (create one) or NONE. */
  categoryChoice: string;
  newCategory: string;
  /** Additional existing categories the transaction also belongs to. */
  extraIds: string[];
  shareWithFamily: boolean;
  familyMemberName: string;
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
      paymentMode: p.payment_mode || DEFAULT_PAYMENT_MODE,
      categoryChoice: p.category ? p.category.id : p.new_category ? NEW : NONE,
      newCategory: p.new_category ?? "",
      extraIds: [],
      shareWithFamily: false,
      familyMemberName: "",
    })),
  };
}

const parseAmount = (s: string) => Number(s.replace(/,/g, ""));
const isValid = (d: Draft) =>
  Number.isFinite(parseAmount(d.amount)) &&
  parseAmount(d.amount) > 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
  !(d.categoryChoice === NEW && !d.newCategory.trim());

export default function TransactionInput({ categories, paymentModes, familyId, familyMembers = [], onSaved, onReviewChange }: Props) {
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
            paymentMode: d.paymentMode,
            familyId,
            shareWithFamily: d.shareWithFamily,
            familyMemberName: d.familyMemberName.trim() || null,
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
    <Card>
      <h2>{reviewing ? "Review transactions" : "Add transactions"}</h2>

      {/* While there's parsed data to edit/save, the input is hidden so the review has the focus. */}
      {!reviewing && (
        <>
          <Message>
            Type or tap the mic, in English or Hindi. You can say several at once, like{" "}
            <em>“15 sep Akhil 500rs, Ramesh 200 and Swiggy 350”</em>.
          </Message>

          <form className="mt-3 flex items-center gap-2" onSubmit={submitText}>
            <Input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 15 sep Akhil 500rs, Swiggy 350"
              disabled={busy}
              aria-label="Transactions"
            />
            <Button disabled={!text.trim() || busy}>Add</Button>
            {micAvailable && (
              <MicButton onClick={toggleMic} disabled={busy} aria-label="Start voice input" title="Tap to speak">
                <MicIcon size={26} />
              </MicButton>
            )}
          </form>

          {/* Voice progress is shown by the full-screen overlay; typed input has no overlay. */}
          {status === "thinking" && !viaVoice && <Message kind="info">Working it out...</Message>}
          {!micAvailable && <Message>Voice input isn't available on this device, so typing only.</Message>}
        </>
      )}

      {viaVoice && (status === "recording" || status === "thinking") && (
        <VoiceOverlay
          phase={status === "recording" ? "recording" : "processing"}
          onStop={() => void finishRecording()}
          onCancel={cancelVoice}
        />
      )}

      {error && <Message kind="error">{error}</Message>}
      {notice && <Message kind="success">{notice}</Message>}

      {review && (
        <div className="mt-3 border-t border-dashed pt-2.5">
          {review.heard && (
            <Message>
              You said: <em>“{review.heard}”</em>
            </Message>
          )}
          <h3>
            {count === 1 ? "Check before saving" : `Found ${count} transactions. Check before saving`}
          </h3>

          {review.drafts.map((d, i) => (
            <div className="mb-3 rounded-lg border bg-surface p-3" key={i}>
              <div className="mb-3 flex items-start gap-1.5">
                <Segmented
                  type="single"
                  variant="outline"
                  className="flex-1"
                  value={d.type}
                  onValueChange={(v) => v && updateAt(i, { type: v as TxnType })}
                  aria-label={`Debit or credit for transaction ${i + 1}`}
                >
                  <SegmentedItem value="debit" tone="debit">
                    ↑ Debit
                  </SegmentedItem>
                  <SegmentedItem value="credit" tone="credit">
                    ↓ Credit
                  </SegmentedItem>
                </Segmented>
                {count > 1 && (
                  <Button variant="ghost" size="icon" aria-label={`Remove transaction ${i + 1}`} onClick={() => removeAt(i)}>
                    ✕
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Amount (₹)">
                  <Input
                    inputMode="decimal"
                    value={d.amount}
                    onChange={(e) => updateAt(i, { amount: e.target.value })}
                    placeholder="0"
                    aria-invalid={!(parseAmount(d.amount) > 0)}
                  />
                </Field>
                <Field label="Date">
                  <Input type="date" max={localToday()} value={d.date} onChange={(e) => updateAt(i, { date: e.target.value })} />
                </Field>
                <Field label={d.type === "debit" ? "Paid to" : "Received from"} className="col-span-full">
                  <Input value={d.party} onChange={(e) => updateAt(i, { party: e.target.value })} placeholder="e.g. Akhil" />
                </Field>
                <Field label="Mode of payment" className="col-span-full">
                  <Select value={d.paymentMode} onValueChange={(v) => updateAt(i, { paymentMode: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentModes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category" className="col-span-full">
                  <Select value={d.categoryChoice} onValueChange={(v) => updateAt(i, { categoryChoice: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW}>＋ New category...</SelectItem>
                      <SelectItem value={NONE}>No category</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {d.categoryChoice === NEW && (
                  <Field label="New category name" className="col-span-full">
                    <Input
                      value={d.newCategory}
                      onChange={(e) => updateAt(i, { newCategory: e.target.value })}
                      placeholder="e.g. Friends & Family"
                    />
                  </Field>
                )}
                {categories.length > 1 && (
                  <div className="col-span-full flex flex-col gap-1.5">
                    <span className="text-[0.85rem] font-bold text-heading">Also in (optional)</span>
                    <Segmented
                      type="multiple"
                      variant="chip"
                      value={d.extraIds}
                      onValueChange={(ids) => updateAt(i, { extraIds: ids })}
                      aria-label="Also in (optional)"
                    >
                      {categories
                        .filter((c) => c.id !== d.categoryChoice)
                        .map((c) => (
                          <SegmentedItem key={c.id} value={c.id}>
                            {c.name}
                          </SegmentedItem>
                        ))}
                    </Segmented>
                  </div>
                )}
                <Field label="Share with family" className="col-span-full">
                  <Select
                    value={d.shareWithFamily ? "yes" : "no"}
                    onValueChange={(v) => updateAt(i, { shareWithFamily: v === "yes" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {d.shareWithFamily && (
                  <Field label="Family member" className="col-span-full">
                    <Select value={d.familyMemberName} onValueChange={(v) => updateAt(i, { familyMemberName: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a member" />
                      </SelectTrigger>
                      <SelectContent>
                        {familyMembers
                          .filter((member) => member.name)
                          .map((member) => (
                            <SelectItem key={member.id} value={member.name!}>
                              {member.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
              {!(parseAmount(d.amount) > 0) && <Message kind="error">Enter an amount greater than 0.</Message>}
            </div>
          ))}

          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={!allValid || status !== "idle"}>
              {status === "saving" ? "Saving..." : count === 1 ? "Save" : `Save all ${count}`}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={status === "saving"}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
