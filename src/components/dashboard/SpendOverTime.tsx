import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeBucket } from "../../lib/analytics";
import { formatMoney, formatMoneyCompact } from "../../lib/format";
import type { Granularity } from "../../types";

/** Tooltip colours come from the theme (CSS variables), so it follows light/dark mode. */
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--text)",
  },
  labelStyle: { color: "var(--text)" },
  itemStyle: { color: "var(--text)" },
};

export function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  return (
    <div className="seg" role="group" aria-label="Group by">
      <button type="button" className={value === "weekly" ? "on" : ""} onClick={() => onChange("weekly")}>
        Weekly
      </button>
      <button type="button" className={value === "monthly" ? "on" : ""} onClick={() => onChange("monthly")}>
        Monthly
      </button>
    </div>
  );
}

export default function SpendOverTime({ data, granularity }: { data: TimeBucket[]; granularity: Granularity }) {
  if (data.length === 0) return <p className="empty">No spending in this period.</p>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4d8c6" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a7766" }} minTickGap={14} />
        <YAxis tick={{ fontSize: 11, fill: "#8a7766" }} tickFormatter={formatMoneyCompact} width={56} />
        <Tooltip
          formatter={(v: number) => [formatMoney(v), "Spent"]}
          labelFormatter={(l) => (granularity === "weekly" ? `Week of ${l}` : String(l))}
          cursor={{ fill: "rgba(176,137,104,0.12)" }}
          {...TOOLTIP_STYLE}
        />
        <Bar dataKey="total" fill="#b08968" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
