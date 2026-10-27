import { useMemo } from "react";
import { Message } from "@/components/ui/message";
import type { CategoryTotal } from "../../lib/analytics";
import { formatMoney } from "../../lib/format";

const MIN_SIZE = 13;
const MAX_SIZE = 46;

/** Stable pseudo-random order so words look scattered but don't jump around on re-render. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface Props {
  data: CategoryTotal[];
  colors: Map<string, string>;
}

export default function WordCloud({ data, colors }: Props) {
  const words = useMemo(() => {
    if (data.length === 0) return [];
    const roots = data.map((d) => Math.sqrt(Math.max(d.value, 0)));
    const max = Math.max(...roots);
    const min = Math.min(...roots);
    return data
      .map((d, i) => {
        // sqrt scale keeps small categories readable beside a dominant one.
        const t = max === min ? 1 : (roots[i] - min) / (max - min);
        return { ...d, size: MIN_SIZE + t * (MAX_SIZE - MIN_SIZE), order: hash(d.name) };
      })
      .sort((a, b) => a.order - b.order);
  }, [data]);

  if (words.length === 0) return <Message kind="empty" className="py-8">No spending in this period.</Message>;

  return (
    <div className="flex min-h-[180px] flex-wrap items-center justify-center gap-x-4 gap-y-0.5 p-2 leading-[1.15]" role="list">
      {words.map((w) => (
        <span
          key={w.name}
          role="listitem"
          className="cursor-default font-extrabold transition-transform duration-150 hover:scale-[1.08] motion-reduce:transition-none"
          style={{ fontSize: w.size, color: colors.get(w.name) }}
          title={`${w.name}: ${formatMoney(w.value)} (${w.count} expense${w.count === 1 ? "" : "s"})`}
        >
          {w.name}
        </span>
      ))}
    </div>
  );
}
