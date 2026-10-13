import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryTotal } from "../../lib/analytics";
import { formatMoney } from "../../lib/format";
import { TOOLTIP_STYLE } from "./SpendOverTime";

interface Props {
  data: CategoryTotal[];
  colors: Map<string, string>;
}

export default function CategoryChart({ data, colors }: Props) {
  if (data.length === 0) return <p className="empty">No spending in this period.</p>;
  const sum = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="category-chart">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={95}
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={colors.get(d.name)} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatMoney(v)} {...TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="legend">
        {data.map((d) => (
          <li key={d.name}>
            <span className="dot" style={{ background: colors.get(d.name) }} />
            <span className="legend-name">{d.name}</span>
            <span className="legend-pct">{sum > 0 ? Math.round((d.value / sum) * 100) : 0}%</span>
            <span className="legend-value">{formatMoney(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
