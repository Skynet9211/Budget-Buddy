import { useMemo, useState } from "react";
import {
  categoryTotals,
  filterByRange,
  filterFlowsByRange,
  firstDate,
  paymentModeTotals,
  timeSeries,
  totalSpend,
} from "../lib/analytics";
import { daysInclusive, formatFullDate } from "../lib/dates";
import { useTheme } from "../hooks/useTheme";
import { colorMap, formatMoney, formatMoneyShort } from "../lib/format";
import { chartColors, getPalette } from "../lib/themes";
import type { Expense, Granularity, MultiCategoryMode, PaymentFlow, PaymentMode } from "../types";
import CategoryChart from "./dashboard/CategoryChart";
import DateFilter, { defaultRange, type DateRange } from "./dashboard/DateFilter";
import PaymentModeChart from "./dashboard/PaymentModeChart";
import SpendOverTime, { GranularityToggle } from "./dashboard/SpendOverTime";
import WordCloud from "./dashboard/WordCloud";
import { Card, CardHeader } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function Stat({ label, value, sub, big = false, className }: { label: string; value: string; sub: string; big?: boolean; className?: string }) {
  return (
    <Card asChild className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <div>
        <span className="text-[0.8rem] font-bold text-muted-foreground">{label}</span>
        <span className={cn("font-extrabold text-heading wrap-anywhere", big ? "text-[2rem]" : "text-[1.2rem]")}>{value}</span>
        <span className="text-[0.8rem] text-muted-foreground wrap-anywhere">{sub}</span>
      </div>
    </Card>
  );
}

interface Props {
  /** Money-out only. An expense may list several categories. */
  expenses: Expense[];
  loading: boolean;
  /** Money in AND out, each with its mode of payment. */
  flows: PaymentFlow[];
  paymentModes: PaymentMode[];
  flowsLoading: boolean;
}

/**
 * Landing dashboard: total spend, spend by category (donut + word cloud), debited / credited per
 * mode of payment, and spend over time (weekly / monthly). Defaults to the last month; "All time"
 * starts on 1 Jan 2000.
 */
export default function Dashboard({ expenses, loading, flows, paymentModes, flowsLoading }: Props) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [mode, setMode] = useState<MultiCategoryMode>("split");

  const filtered = useMemo(() => filterByRange(expenses, range.from, range.to), [expenses, range]);
  const total = useMemo(() => totalSpend(filtered), [filtered]);
  const byCategory = useMemo(() => categoryTotals(filtered, mode), [filtered, mode]);
  const byMode = useMemo(
    () => paymentModeTotals(filterFlowsByRange(flows, range.from, range.to), paymentModes),
    [flows, range, paymentModes],
  );
  const { palette, resolved } = useTheme();
  const colors = useMemo(
    () => colorMap(byCategory.map((c) => c.name), chartColors(getPalette(palette), resolved)),
    [byCategory, palette, resolved],
  );
  const series = useMemo(
    () => timeSeries(filtered, range.from, range.to, granularity),
    [filtered, range, granularity],
  );

  // "All time" starts in 2000, so average over the days that actually have data.
  const spanDays = useMemo(() => {
    const start = range.preset === "all" ? firstDate(filtered) ?? range.from : range.from;
    return daysInclusive(start, range.to);
  }, [range, filtered]);

  const top = byCategory[0];
  const hasMulti = filtered.some((e) => e.categories.length > 1);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <DateFilter value={range} onChange={setRange} />
        <Message className="mt-2.5">
          {range.preset === "all"
            ? "All time"
            : `${formatFullDate(range.from)} – ${formatFullDate(range.to)}`}
        </Message>
      </Card>

      <section className="grid grid-cols-2 gap-3">
        <Stat
          big
          className="col-span-full"
          label="Total spending"
          value={loading ? "…" : formatMoneyShort(total)}
          sub={`${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`}
        />
        <Stat label="Per day" value={loading ? "…" : formatMoneyShort(total / spanDays)} sub={`over ${spanDays} days`} />
        <Stat label="Top category" value={top ? top.name : "—"} sub={top ? formatMoney(top.value) : "No data"} />
      </section>

      <Card>
        <CardHeader>
          <h2>By category</h2>
          {hasMulti && (
            <Select value={mode} onValueChange={(v) => setMode(v as MultiCategoryMode)}>
              <SelectTrigger size="sm" className="w-auto" title="How a transaction with several categories is counted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="split">Split evenly</SelectItem>
                <SelectItem value="full">Full amount in each</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CategoryChart data={byCategory} colors={colors} />
        {hasMulti && (
          <Message className="mt-2.5">
            {mode === "split"
              ? "Transactions in several categories are split evenly between them."
              : "Transactions in several categories count in full in each, so categories add up to more than the total."}
          </Message>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2>By mode of payment</h2>
        </CardHeader>
        {flowsLoading ? <Message>Loading...</Message> : <PaymentModeChart data={byMode} />}
        <Message className="mt-2.5">Money going out (debited) and coming in (credited) through each mode.</Message>
      </Card>

      <Card>
        <CardHeader>
          <h2>Category cloud</h2>
        </CardHeader>
        <WordCloud data={byCategory} colors={colors} />
        <Message className="mt-2.5">Bigger word = more spent in that category.</Message>
      </Card>

      <Card>
        <CardHeader>
          <h2>Spending over time</h2>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </CardHeader>
        <SpendOverTime data={series} granularity={granularity} />
      </Card>
    </div>
  );
}
