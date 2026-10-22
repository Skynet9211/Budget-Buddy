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
    <div className="dashboard">
      <section className="card">
        <DateFilter value={range} onChange={setRange} />
        <p className="hint">
          {range.preset === "all"
            ? "All time"
            : `${formatFullDate(range.from)} – ${formatFullDate(range.to)}`}
        </p>
      </section>

      <section className="dash-stats">
        <div className="card stat total">
          <span className="stat-label">Total spending</span>
          <span className="stat-value">{loading ? "…" : formatMoneyShort(total)}</span>
          <span className="stat-sub">
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Per day</span>
          <span className="stat-value small">{loading ? "…" : formatMoneyShort(total / spanDays)}</span>
          <span className="stat-sub">over {spanDays} days</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Top category</span>
          <span className="stat-value small">{top ? top.name : "—"}</span>
          <span className="stat-sub">{top ? formatMoney(top.value) : "No data"}</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>By category</h2>
          {hasMulti && (
            <label className="mode-select" title="How a transaction with several categories is counted">
              <select value={mode} onChange={(e) => setMode(e.target.value as MultiCategoryMode)}>
                <option value="split">Split evenly</option>
                <option value="full">Full amount in each</option>
              </select>
            </label>
          )}
        </div>
        <CategoryChart data={byCategory} colors={colors} />
        {hasMulti && (
          <p className="hint">
            {mode === "split"
              ? "Transactions in several categories are split evenly between them."
              : "Transactions in several categories count in full in each, so categories add up to more than the total."}
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>By mode of payment</h2>
        </div>
        {flowsLoading ? <p className="hint">Loading...</p> : <PaymentModeChart data={byMode} />}
        <p className="hint">Money going out (debited) and coming in (credited) through each mode.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Category cloud</h2>
        </div>
        <WordCloud data={byCategory} colors={colors} />
        <p className="hint">Bigger word = more spent in that category.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Spending over time</h2>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
        <SpendOverTime data={series} granularity={granularity} />
      </section>
    </div>
  );
}
