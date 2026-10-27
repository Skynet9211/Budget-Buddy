import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Message } from "@/components/ui/message";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import type { TimeBucket } from "../../lib/analytics";
import { formatMoney, formatMoneyCompact } from "../../lib/format";
import type { Granularity } from "../../types";

/** Tooltip colours come from the theme (CSS variables), so it follows light/dark mode. */
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--foreground)" },
  itemStyle: { color: "var(--foreground)" },
};

/** Axis, grid and hover-cursor styling shared by the bar charts. */
export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
export const GRID_STROKE = "var(--border)";
export const BAR_CURSOR = { fill: "color-mix(in srgb, var(--primary) 12%, transparent)" };

export function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  return (
    <Segmented type="single" value={value} onValueChange={(v) => v && onChange(v as Granularity)} aria-label="Group by">
      <SegmentedItem value="weekly">Weekly</SegmentedItem>
      <SegmentedItem value="monthly">Monthly</SegmentedItem>
    </Segmented>
  );
}

export default function SpendOverTime({ data, granularity }: { data: TimeBucket[]; granularity: Granularity }) {
  if (data.length === 0) return <Message kind="empty" className="py-8">No spending in this period.</Message>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="label" tick={AXIS_TICK} minTickGap={14} />
        <YAxis tick={AXIS_TICK} tickFormatter={formatMoneyCompact} width={56} />
        <Tooltip
          formatter={(v: number) => [formatMoney(v), "Spent"]}
          labelFormatter={(l) => (granularity === "weekly" ? `Week of ${l}` : String(l))}
          cursor={BAR_CURSOR}
          {...TOOLTIP_STYLE}
        />
        <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
