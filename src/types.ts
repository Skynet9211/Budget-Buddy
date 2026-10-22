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

/** A mode of payment (a row of the `payment_modes` table), e.g. { id: "upi", name: "UPI" }. */
export interface PaymentMode {
  id: string;
  name: string;
}

/** One transaction, money in OR out, as the payment-mode chart sees it. */
export interface PaymentFlow {
  /** ISO date, YYYY-MM-DD */
  date: string;
  amount: number;
  type: "debit" | "credit";
  /** A `PaymentMode` id. */
  paymentMode: string;
}

/**
 * How an expense with several categories is attributed in category charts.
 * - "split": amount is divided evenly across its categories (category totals add up to the overall total)
 * - "full": the full amount counts toward every category (category totals can exceed the overall total)
 */
export type MultiCategoryMode = "split" | "full";

export type Granularity = "weekly" | "monthly";

export interface Family {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
  profile?: { email?: string | null } | null;
}

export interface FamilyInvitation {
  id: string;
  family_id: string;
  email: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined" | "expired";
  token: string;
  created_at: string;
  updated_at: string;
}
