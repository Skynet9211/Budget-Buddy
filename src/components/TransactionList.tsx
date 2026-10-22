import { Link } from "react-router-dom";
import { emojiFor } from "../lib/categories";
import { paymentModeName } from "../lib/paymentModes";
import { formatDate, formatMoney, type Transaction } from "../lib/transactions";
import type { PaymentMode } from "../types";

interface Props {
  transactions: Transaction[];
  paymentModes: PaymentMode[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
}

export default function TransactionList({ transactions, paymentModes, loading, onDelete }: Props) {
  const spent = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const received = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);

  return (
    <section className="card">
      <h2>Transactions {transactions.length > 0 && <span className="count">{transactions.length}</span>}</h2>

      {transactions.length > 0 && (
        <div className="totals">
          <div>
            <span className="label">Spent</span>
            <strong className="debit">{formatMoney(spent)}</strong>
          </div>
          <div>
            <span className="label">Received</span>
            <strong className="credit">{formatMoney(received)}</strong>
          </div>
        </div>
      )}

      {loading && <p className="hint">Loading...</p>}
      {!loading && transactions.length === 0 && (
        <p className="empty">No transactions yet. Say or type your first one above ✨</p>
      )}

      <ul className="cat-list">
        {transactions.map((t) => (
          <li key={t.id} className="cat txn">
            <Link to={`/transactions/${t.id}`} className="txn-link">
              <span className="emoji">{emojiFor(t.category?.name ?? t.party ?? "")}</span>
              <div className="txn-main">
                <span className="name">{t.party ?? t.category?.name ?? "Transaction"}</span>
                <span className="txn-sub">
                  {t.category ? `${t.category.name} · ` : ""}
                  {paymentModeName(t.paymentMode, paymentModes)} · {formatDate(t.date)}
                </span>
              </div>
              <strong className={`amount ${t.type}`}>
                {t.type === "debit" ? "−" : "+"}
                {formatMoney(t.amount, t.currency)}
              </strong>
            </Link>
            <button
              className="icon-btn danger"
              aria-label="Delete transaction"
              onClick={() => {
                if (confirm("Delete this transaction?")) onDelete(t.id);
              }}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
