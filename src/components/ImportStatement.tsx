import { useEffect, useRef, useState } from "react";
import DateFilter, { rangeForPreset, type DateRange } from "./dashboard/DateFilter";
import { documentKind, readDocumentText } from "../lib/documentText";
import { chunkLines, findDuplicates } from "../lib/statementImport";
import {
  PartialSaveError,
  fetchTransactionKeysInRange,
  formatDate,
  formatMoney,
  parseStatementChunk,
  saveTransactionsBatched,
  type StatementTransaction,
  type TxnType,
} from "../lib/transactions";
import { DEFAULT_PAYMENT_MODE } from "../lib/paymentModes";
import type { Category } from "../hooks/useCategories";
import type { PaymentMode } from "../types";

interface Props {
  categories: Category[];
  paymentModes: PaymentMode[];
  familyId?: string | null;
  onSaved: () => Promise<void> | void;
  /** Called with true while extracted rows are waiting to be edited/saved, false otherwise. */
  onReviewChange?: (active: boolean) => void;
}

type Step = "choose" | "extracting" | "review" | "saving";

const NEW = "__new__";
const NONE = "__none__";
/** Wait before retrying a chunk the AI was too busy for (free-tier per-minute limit). */
const BUSY_RETRY_MS = 12000;

interface Row {
  key: number;
  include: boolean;
  duplicate: boolean;
  type: TxnType;
  amount: string;
  date: string;
  party: string;
  /** The statement's own text for this row, shown for reference and saved as the note. */
  description: string;
  paymentMode: string;
  /** A category id, NEW (create one) or NONE. */
  categoryChoice: string;
  newCategory: string;
}

let nextKey = 1;

function toRow(t: StatementTransaction, duplicate: boolean): Row {
  return {
    key: nextKey++,
    include: !duplicate,
    duplicate,
    type: t.type,
    amount: t.amount != null ? String(t.amount) : "",
    date: t.date,
    party: t.party ?? "",
    description: t.description ?? "",
    paymentMode: t.payment_mode || DEFAULT_PAYMENT_MODE,
    categoryChoice: t.category ? t.category.id : t.new_category ? NEW : NONE,
    newCategory: t.new_category ?? "",
  };
}

const parseAmount = (s: string) => Number(s.replace(/,/g, ""));
const amountOk = (r: Row) => Number.isFinite(parseAmount(r.amount)) && parseAmount(r.amount) > 0;
const dateOk = (r: Row, range: DateRange) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= range.from && r.date <= range.to;
const categoryOk = (r: Row) => !(r.categoryChoice === NEW && !r.newCategory.trim());
const isValid = (r: Row, range: DateRange) => amountOk(r) && dateOk(r, range) && categoryOk(r);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ImportStatement({ categories, paymentModes, familyId, onSaved, onReviewChange }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("1m"));
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Bumped on every extraction and on cancel, so a cancelled job's late results are ignored. */
  const job = useRef(0);

  const reviewing = step === "review" || step === "saving";
  useEffect(() => {
    onReviewChange?.(reviewing);
  }, [reviewing, onReviewChange]);
  useEffect(
    () => () => {
      job.current++;
      onReviewChange?.(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function pickFile(f: File | null) {
    setError(null);
    setNotice(null);
    if (f && !documentKind(f)) {
      setError("Choose a PDF or Word (.docx) file.");
      setFile(null);
      return;
    }
    setFile(f);
  }

  function startOver() {
    job.current++;
    setRows([]);
    setStep("choose");
    setProgress("");
  }

  async function extract() {
    if (!file || step !== "choose") return;
    const mine = ++job.current;
    const live = () => mine === job.current;
    setError(null);
    setNotice(null);
    setStep("extracting");
    try {
      setProgress("Reading the file...");
      const chunks = chunkLines(await readDocumentText(file));
      if (!live()) return;
      if (!chunks.length) throw new Error("Couldn't find any text in that file.");

      const found: StatementTransaction[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const label = chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : "";
        setProgress(`Finding transactions${label}...`);
        let result: StatementTransaction[];
        try {
          result = await parseStatementChunk(chunks[i], range.from, range.to);
        } catch (err) {
          if (!/busy/i.test((err as Error).message)) throw err;
          if (!live()) return;
          setProgress(`The AI is busy, retrying in a moment${label}...`);
          await sleep(BUSY_RETRY_MS);
          if (!live()) return;
          result = await parseStatementChunk(chunks[i], range.from, range.to);
        }
        if (!live()) return;
        found.push(...result);
      }

      if (!found.length) {
        throw new Error(`No transactions found between ${formatDate(range.from)} and ${formatDate(range.to)} in that file.`);
      }

      setProgress("Checking for transactions you've already saved...");
      let duplicates = found.map(() => false);
      try {
        const existing = await fetchTransactionKeysInRange(range.from, range.to);
        duplicates = findDuplicates(
          found.map((t) => ({ date: t.date, type: t.type, amount: t.amount ?? 0 })),
          existing,
        );
      } catch (err) {
        console.warn("Duplicate check skipped:", err);
      }
      if (!live()) return;

      setRows(found.map((t, i) => toRow(t, duplicates[i])));
      setStep("review");
    } catch (err) {
      if (!live()) return;
      setError((err as Error).message);
      setStep("choose");
    } finally {
      if (live()) setProgress("");
    }
  }

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  function addRow() {
    setRows((rs) => [
      ...rs,
      {
        key: nextKey++,
        include: true,
        duplicate: false,
        type: "debit",
        amount: "",
        date: range.to,
        party: "",
        description: "",
        paymentMode: DEFAULT_PAYMENT_MODE,
        categoryChoice: NONE,
        newCategory: "",
      },
    ]);
  }

  const selected = rows.filter((r) => r.include);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const allValid = selected.length > 0 && selected.every((r) => isValid(r, range));
  const total = (type: TxnType) =>
    selected.filter((r) => r.type === type && amountOk(r)).reduce((sum, r) => sum + parseAmount(r.amount), 0);
  const duplicateCount = rows.filter((r) => r.duplicate).length;

  async function save() {
    if (!allValid || step !== "review" || !file) return;
    setError(null);
    setStep("saving");
    const toSave = selected;
    try {
      await saveTransactionsBatched(
        toSave.map((r) => {
          const existing = r.categoryChoice !== NEW && r.categoryChoice !== NONE;
          return {
            type: r.type,
            date: r.date,
            amount: parseAmount(r.amount),
            party: r.party.trim() || null,
            categoryId: existing ? r.categoryChoice : null,
            newCategory: r.categoryChoice === NEW ? r.newCategory.trim() : null,
            rawText: `Imported from ${file.name}${r.description ? `: ${r.description}` : ""}`,
            paymentMode: r.paymentMode,
            familyId,
          };
        }),
      );
      await onSaved();
      setNotice(`Saved ${toSave.length} ${toSave.length === 1 ? "transaction" : "transactions"} ✓`);
      setRows([]);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStep("choose");
    } catch (err) {
      if (err instanceof PartialSaveError) {
        // The first `saved` selected rows are stored; drop them so a retry doesn't save them twice.
        const saved = new Set(toSave.slice(0, err.saved).map((r) => r.key));
        setRows((rs) => rs.filter((r) => !saved.has(r.key)));
        await onSaved();
      }
      setError((err as Error).message);
      setStep("review");
    }
  }

  if (!reviewing) {
    return (
      <section className="card import">
        <h2>Import a statement</h2>
        <p className="hint">
          Upload a bank, UPI or credit card statement (PDF or Word). Pick the dates you want and the transactions in that
          range are pulled out for you to check before saving.
        </p>

        <label className="file-pick">
          <span>Statement file</span>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            disabled={step === "extracting"}
          />
        </label>

        <h3>Dates to import</h3>
        <DateFilter value={range} onChange={setRange} />

        <div className="actions">
          <button className="btn primary" onClick={extract} disabled={!file || step === "extracting"}>
            {step === "extracting" ? "Extracting..." : "Extract transactions"}
          </button>
          {step === "extracting" && (
            <button className="btn ghost" onClick={startOver}>
              Cancel
            </button>
          )}
        </div>

        {progress && <p className="info">{progress}</p>}
        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
      </section>
    );
  }

  const saving = step === "saving";

  return (
    <section className="card import import-review">
      <h2>Review imported transactions</h2>
      <p className="hint">
        Found {rows.length} {rows.length === 1 ? "transaction" : "transactions"} between {formatDate(range.from)} and{" "}
        {formatDate(range.to)} in <em>{file?.name}</em>. Fix anything that's wrong, untick rows you don't want, then save.
      </p>
      {duplicateCount > 0 && (
        <p className="info">
          {duplicateCount} {duplicateCount === 1 ? "row looks" : "rows look"} like {duplicateCount === 1 ? "a transaction" : "transactions"}{" "}
          you've already saved (same date, amount and direction). {duplicateCount === 1 ? "It's" : "They're"} unticked.
        </p>
      )}

      <div className="totals">
        <div>
          <span className="label">Selected</span>
          <strong>{selected.length}</strong>
        </div>
        <div>
          <span className="label">Money out</span>
          <strong className="debit">{formatMoney(total("debit"))}</strong>
        </div>
        <div>
          <span className="label">Money in</span>
          <strong className="credit">{formatMoney(total("credit"))}</strong>
        </div>
      </div>

      <div className="import-table-wrap">
        <table className="import-table">
          <thead>
            <tr>
              <th className="sticky">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))}
                  disabled={saving}
                />
              </th>
              <th>Date</th>
              <th>Paid to / received from</th>
              <th>Direction</th>
              <th>Amount (₹)</th>
              <th>Mode</th>
              <th>Category</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const n = i + 1;
              const check = r.include;
              return (
                <tr key={r.key} className={check ? "" : "off"}>
                  <td className="sticky">
                    <input
                      type="checkbox"
                      aria-label={`Include row ${n}`}
                      checked={r.include}
                      onChange={(e) => updateRow(r.key, { include: e.target.checked })}
                      disabled={saving}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      min={range.from}
                      max={range.to}
                      value={r.date}
                      onChange={(e) => updateRow(r.key, { date: e.target.value })}
                      aria-label={`Date, row ${n}`}
                      aria-invalid={check && !dateOk(r, range)}
                      disabled={saving}
                    />
                  </td>
                  <td className="party-cell">
                    <input
                      value={r.party}
                      onChange={(e) => updateRow(r.key, { party: e.target.value })}
                      placeholder="e.g. Swiggy"
                      aria-label={`Paid to or received from, row ${n}`}
                      disabled={saving}
                    />
                    {r.duplicate && <span className="badge">Possible duplicate</span>}
                    {r.description && <span className="narration">{r.description}</span>}
                  </td>
                  <td>
                    <div className="type-toggle compact" role="group" aria-label={`Debit or credit, row ${n}`}>
                      <button
                        type="button"
                        className={r.type === "debit" ? "on debit" : ""}
                        onClick={() => updateRow(r.key, { type: "debit" })}
                        disabled={saving}
                      >
                        ↑ Out
                      </button>
                      <button
                        type="button"
                        className={r.type === "credit" ? "on credit" : ""}
                        onClick={() => updateRow(r.key, { type: "credit" })}
                        disabled={saving}
                      >
                        ↓ In
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                      placeholder="0"
                      aria-label={`Amount, row ${n}`}
                      aria-invalid={check && !amountOk(r)}
                      disabled={saving}
                    />
                  </td>
                  <td>
                    <select
                      value={r.paymentMode}
                      onChange={(e) => updateRow(r.key, { paymentMode: e.target.value })}
                      aria-label={`Mode of payment, row ${n}`}
                      disabled={saving}
                    >
                      {paymentModes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="category-cell">
                    <select
                      value={r.categoryChoice}
                      onChange={(e) => updateRow(r.key, { categoryChoice: e.target.value })}
                      aria-label={`Category, row ${n}`}
                      disabled={saving}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value={NEW}>＋ New category...</option>
                      <option value={NONE}>No category</option>
                    </select>
                    {r.categoryChoice === NEW && (
                      <input
                        value={r.newCategory}
                        onChange={(e) => updateRow(r.key, { newCategory: e.target.value })}
                        placeholder="New category name"
                        aria-label={`New category name, row ${n}`}
                        aria-invalid={check && !categoryOk(r)}
                        disabled={saving}
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove row ${n}`}
                      onClick={() => removeRow(r.key)}
                      disabled={saving}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button className="btn ghost small add-row" onClick={addRow} disabled={saving}>
        ＋ Add row
      </button>

      {selected.length > 0 && !allValid && (
        <p className="error">
          Some ticked rows need fixing: amounts must be more than 0, dates must be between {formatDate(range.from)} and{" "}
          {formatDate(range.to)}, and new categories need a name.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button className="btn primary" onClick={save} disabled={!allValid || saving}>
          {saving ? "Saving..." : `Save ${selected.length} ${selected.length === 1 ? "transaction" : "transactions"}`}
        </button>
        <button className="btn ghost" onClick={startOver} disabled={saving}>
          Start over
        </button>
      </div>
    </section>
  );
}
