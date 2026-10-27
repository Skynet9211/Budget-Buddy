import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Message } from "@/components/ui/message";
import type { CategoryTotal } from "../../lib/analytics";
import { formatMoney } from "../../lib/format";
import { TOOLTIP_STYLE } from "./SpendOverTime";

interface Props {
  data: CategoryTotal[];
  colors: Map<string, string>;
}

export default function CategoryChart({ data, colors }: Props) {
  if (data.length === 0) return <Message kind="empty" className="py-8">No spending in this period.</Message>;
  const sum = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
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
      <ul className="mt-1.5 flex max-h-[200px] flex-col gap-1.5 overflow-auto">
        {data.map((d) => (
          <li key={d.name} className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2.5 text-[0.9rem]">
            <span className="size-2.5 rounded-full" style={{ background: colors.get(d.name) }} />
            <span className="font-bold wrap-anywhere">{d.name}</span>
            <span className="min-w-10 text-right text-muted-foreground">{sum > 0 ? Math.round((d.value / sum) * 100) : 0}%</span>
            <span className="min-w-20 text-right tabular-nums">{formatMoney(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
