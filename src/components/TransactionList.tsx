import { Link } from "react-router-dom";
import { emojiFor } from "../lib/categories";
import { paymentModeName } from "../lib/paymentModes";
import { formatDate, formatMoney, type Transaction } from "../lib/transactions";
import type { PaymentMode } from "../types";
import { useSearch } from "../hooks/useSearch";

interface Props {
  transactions: Transaction[];
  paymentModes: PaymentMode[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
}

export default function TransactionList({ transactions, paymentModes, loading, onDelete }: Props) {
  const { query, setQuery, filtered } = useSearch(transactions, (t, q) => {
    const haystack = [
      t.party,
      t.category?.name,
      t.rawText,
      paymentModeName(t.paymentMode, paymentModes),
      formatDate(t.date),
      String(t.amount),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const spent = filtered.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const received = filtered.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);

  return (
    <section className="card">
      <h2>Transactions {filtered.length > 0 && <span className="count">{filtered.length}</span>}</h2>

      <div className="list-filter">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transactions"
          aria-label="Search transactions"
        />
      </div>

      {filtered.length > 0 && (
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
      {!loading && filtered.length === 0 && (
        <p className="empty">{query ? "No matching transactions found" : "No transactions yet. Say or type your first one above ✨"}</p>
      )}

      <ul className="cat-list">
        {filtered.map((t) => (
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
