import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { paymentModeName } from "../lib/paymentModes";
import { fetchTransaction, formatDate, formatMoney, type Transaction } from "../lib/transactions";
import type { PaymentMode } from "../types";

interface Props {
  transactionId: string;
  paymentModes: PaymentMode[];
}

function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="txn-detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function TransactionDetail({ transactionId, paymentModes }: Props) {
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTransaction(transactionId)
      .then((row) => {
        if (cancelled) return;
        setTxn(row);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTxn(null);
        setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  return (
    <section className="card txn-detail">
      <header className="txn-detail-head">
        <Link to="/transactions" className="icon-btn appearance-back" aria-label="Back to transactions">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h2>Transaction</h2>
      </header>

      {loading && <p className="hint">Loading...</p>}
      {!loading && error && <p className="error">{error}</p>}
      {!loading && !error && !txn && (
        <p className="empty">This transaction wasn't found. It may have been deleted.</p>
      )}

      {!loading && txn && (
        <dl className="txn-detail-fields">
          <Row label="Type">{txn.type === "debit" ? "Spent" : "Received"}</Row>
          <Row label="Amount">
            <strong className={txn.type}>
              {txn.type === "debit" ? "−" : "+"}
              {formatMoney(txn.amount, txn.currency)}
            </strong>
          </Row>
          <Row label="Date">{formatDate(txn.date)}</Row>
          <Row label="Mode of payment">{paymentModeName(txn.paymentMode, paymentModes)}</Row>
          <Row label="Party">{txn.party || "—"}</Row>
          <Row label="Category">{txn.category?.name ?? "Uncategorised"}</Row>
          <Row label="Recorded at">{formatRecordedAt(txn.createdAt)}</Row>
          {txn.rawText ? <Row label="Original text">{txn.rawText}</Row> : null}
          <Row label="Transaction id">
            <code className="txn-detail-id">{txn.id}</code>
          </Row>
        </dl>
      )}
    </section>
  );
}
