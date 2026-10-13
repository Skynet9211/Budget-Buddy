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

/**
 * One colour per category (biggest category gets the first), shared by the donut and word cloud.
 * `palette` comes from the active theme (see chartColors in lib/themes).
 */
export function colorMap(names: string[], palette: string[]): Map<string, string> {
  return new Map(names.map((n, i) => [n, palette[i % palette.length]]));
}
