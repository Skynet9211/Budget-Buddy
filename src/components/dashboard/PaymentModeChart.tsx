import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PaymentModeTotal } from "../../lib/analytics";
import { formatMoney, formatMoneyCompact } from "../../lib/format";
import { TOOLTIP_STYLE } from "./SpendOverTime";

/**
 * Money out (debited) and money in (credited) for each mode of payment. The bar colours are set in
 * dashboard.css (`.debit-bar` / `.credit-bar`) so they follow the theme.
 */
export default function PaymentModeChart({ data }: { data: PaymentModeTotal[] }) {
  if (data.length === 0) return <p className="empty">No transactions in this period.</p>;

  return (
    <div className="payment-chart">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={formatMoneyCompact} width={56} />
          <Tooltip
            formatter={(v: number) => formatMoney(v)}
            cursor={{ fill: "rgba(var(--accent-rgb), 0.12)" }}
            {...TOOLTIP_STYLE}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
          <Bar dataKey="debit" name="Debited" className="debit-bar" fill="var(--error)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="credit" name="Credited" className="credit-bar" fill="var(--credit)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <table className="mode-table">
        <thead>
          <tr>
            <th scope="col">Mode</th>
            <th scope="col" className="num">Debited</th>
            <th scope="col" className="num">Credited</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.id}>
              <th scope="row">
                {m.name} <span className="mode-count">{m.count}</span>
              </th>
              <td className="num debit">{m.debit > 0 ? formatMoney(m.debit) : "—"}</td>
              <td className="num credit">{m.credit > 0 ? formatMoney(m.credit) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
