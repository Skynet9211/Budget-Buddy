/** One piece of spending (money out), as the dashboard sees it. */
export interface Expense {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  amount: number;
  description: string;
  /** An expense can belong to one or more categories. Empty = uncategorised. */
  categories: string[];
}

/**
 * How an expense with several categories is attributed in category charts.
 * - "split": amount is divided evenly across its categories (category totals add up to the overall total)
 * - "full": the full amount counts toward every category (category totals can exceed the overall total)
 */
export type MultiCategoryMode = "split" | "full";

export type Granularity = "weekly" | "monthly";
