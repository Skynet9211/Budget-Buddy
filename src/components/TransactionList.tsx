import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { emojiFor } from "../lib/categories";
import { paymentModeName } from "../lib/paymentModes";
import { formatDate, formatMoney, type Transaction } from "../lib/transactions";
import type { PaymentMode } from "../types";
import { matchesSearchQuery, useSearch } from "../hooks/useSearch";

interface Props {
  transactions: Transaction[];
  paymentModes: PaymentMode[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
}

function buildTransactionSuggestions(query: string, transactions: Transaction[], paymentModes: PaymentMode[]) {
  const trimmed = query.trim();
  const items = [...new Set(transactions.map((t) => t.category?.name).filter(Boolean) as string[])];
  const modes = paymentModes.map((m) => m.name);
  const payees = [...new Set(transactions.map((t) => t.party).filter(Boolean) as string[])];
  const types = ["debit", "credit"];
  const suggestions = new Set<string>();

  if (!trimmed) {
    const seed = ["category:food", "price:>100", "mode:card", "date:2024-09", "payee:amazon", "family:alice", "type:debit"];
    seed.forEach((value) => suggestions.add(value));
    return Array.from(suggestions);
  }

  const lower = trimmed.toLowerCase();

  if (/^\d+$/.test(trimmed)) {
    suggestions.add(`price:${trimmed}`);
    suggestions.add(`price:>${trimmed}`);
    suggestions.add(`price:<${trimmed}`);
    return Array.from(suggestions).slice(0, 5);
  }

  const categoryMatches = items.filter((name) => name.toLowerCase().includes(lower));
  categoryMatches.slice(0, 4).forEach((name) => suggestions.add(`category:${name}`));

  if (!trimmed.includes(":")) {
    suggestions.add(`category:${trimmed}`);
    suggestions.add(`price:${trimmed}`);
    suggestions.add(`price:>${trimmed}`);
    suggestions.add(`price:<${trimmed}`);
  }

  const modeMatches = modes.filter((name) => name.toLowerCase().includes(lower));
  modeMatches.slice(0, 4).forEach((name) => suggestions.add(`mode:${name.toLowerCase()}`));

  const payeeMatches = payees.filter((name) => name.toLowerCase().includes(lower));
  payeeMatches.slice(0, 4).forEach((name) => suggestions.add(`payee:${name}`));

  types.filter((type) => type.includes(lower)).forEach((type) => suggestions.add(`type:${type}`));

  if (!trimmed.includes(":")) {
    suggestions.add(`date:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  }

  return Array.from(suggestions).slice(0, 8);
}

export default function TransactionList({ transactions, paymentModes, loading, onDelete }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { query, setQuery, filtered } = useSearch(transactions, (t, q) =>
    matchesSearchQuery(
      t,
      q,
      (item, field) => {
        switch (field) {
          case "category":
            return item.category?.name ?? "";
          case "price":
          case "amount":
            return item.amount;
          case "mode":
            return paymentModeName(item.paymentMode, paymentModes);
          case "payee":
            return item.party ?? "";
          case "family":
            return item.party ?? "";
          case "date":
            return item.date;
          case "type":
            return item.type;
          default:
            return [
              item.party ?? "",
              item.category?.name ?? "",
              item.rawText ?? "",
              paymentModeName(item.paymentMode, paymentModes),
              formatDate(item.date),
              String(item.amount),
              item.type,
            ]
              .filter(Boolean)
              .join(" ");
        }
      },
      (item) =>
        [
          item.party ?? "",
          item.category?.name ?? "",
          item.rawText ?? "",
          paymentModeName(item.paymentMode, paymentModes),
          formatDate(item.date),
          String(item.amount),
          item.type,
        ]
          .filter(Boolean)
          .join(" "),
    ),
  );

  const suggestions = useMemo(() => buildTransactionSuggestions(query, transactions, paymentModes), [query, transactions, paymentModes]);

  const applySuggestion = (value: string) => {
    const next = query.trim();
    const suffix = next && !next.endsWith(";") ? `; ${value}` : value;
    setQuery(next ? `${next} ${suffix}` : value);
    setShowSuggestions(false);
  };

  const spent = filtered.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const received = filtered.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);

  return (
    <section className="card">
      <h2>Transactions {filtered.length > 0 && <span className="count">{filtered.length}</span>}</h2>

      <div className="list-filter-wrap">
        <div className="list-filter">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
            placeholder="Search transactions"
            aria-label="Search transactions"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="search-suggestions" role="listbox">
              {suggestions.map((value) => (
                <button key={value} type="button" className="search-suggestion" onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion(value)}>
                  {value}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="help-btn" onClick={() => setShowHelp(true)} aria-label="Open search help">
          ?
        </button>
      </div>

      {showHelp && (
        <div className="search-help-backdrop" onClick={() => setShowHelp(false)}>
          <div className="search-help-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="search-help-header">
              <h3>Search help</h3>
              <button type="button" className="icon-btn" onClick={() => setShowHelp(false)} aria-label="Close help">
                ✕
              </button>
            </div>

            <ul className="search-help-list">
              <li><strong>;</strong> split conditions</li>
              <li><strong>+</strong> include a term</li>
              <li><strong>-</strong> exclude a term</li>
              <li><strong>category:</strong> food</li>
              <li><strong>price:</strong> &gt;100, &lt;200, =500</li>
              <li><strong>mode:</strong> card, cash, upi</li>
              <li><strong>date:</strong> 2024-09</li>
              <li><strong>payee:</strong> amazon</li>
              <li><strong>family:</strong> alice</li>
              <li><strong>type:</strong> debit or credit</li>
            </ul>

            <div className="search-help-examples">
              <h4>Examples</h4>
              <p>food; +debit; -coffee</p>
              <p>category:food; price:&gt;100</p>
              <p>mode:card; date:2024-09</p>
              <p>payee:amazon; type:credit</p>
            </div>
          </div>
        </div>
      )}

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
