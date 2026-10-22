import type { PaymentMode } from "../types";
import { supabase } from "./supabase";

/** Used when a transaction says nothing about how it was paid. Matches the database default. */
export const DEFAULT_PAYMENT_MODE = "upi";

/**
 * The same list the `payment_modes` table is seeded with. It's shown until the table has loaded
 * (or if it can't be read), so the form always has something to offer.
 */
export const FALLBACK_PAYMENT_MODES: PaymentMode[] = [
  { id: "upi", name: "UPI" },
  { id: "cash", name: "Cash" },
  { id: "card", name: "Card" },
  { id: "netbanking", name: "Net Banking" },
  { id: "wallet", name: "Wallet" },
  { id: "cheque", name: "Cheque" },
];

export async function fetchPaymentModes(): Promise<PaymentMode[]> {
  const { data, error } = await supabase
    .from("payment_modes")
    .select("id,name")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentMode[];
}

/** The label for a mode id, falling back to the id itself for one we don't know. */
export function paymentModeName(id: string, modes: PaymentMode[] = FALLBACK_PAYMENT_MODES): string {
  return modes.find((m) => m.id === id)?.name ?? id;
}
