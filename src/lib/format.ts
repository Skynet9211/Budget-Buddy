const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const moneyExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const moneyCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Whole rupees, for headline numbers. */
export const formatMoneyShort = (n: number) => money.format(n);
/** With paise, for tooltips and legends. */
export const formatMoney = (n: number) => moneyExact.format(n);
/** e.g. ₹1.2K, for chart axes. */
export const formatMoneyCompact = (n: number) => moneyCompact.format(n);

// Distinct earthy tones that sit well on the app's cream theme.
export const CHART_COLORS = [
  "#b08968",
  "#7d9b76",
  "#c0604a",
  "#6b8fa3",
  "#d4a24c",
  "#9b7fa6",
  "#5e8c8a",
  "#c47f9a",
  "#8c6a4a",
  "#a3a86b",
];

/** One colour per category (biggest category gets the first), shared by the donut and word cloud. */
export function colorMap(names: string[]): Map<string, string> {
  return new Map(names.map((n, i) => [n, CHART_COLORS[i % CHART_COLORS.length]]));
}
