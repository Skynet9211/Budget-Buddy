import { useEffect, useState } from "react";
import { fetchPaymentModes, FALLBACK_PAYMENT_MODES } from "../lib/paymentModes";
import type { PaymentMode } from "../types";

/** The modes of payment from the database. Starts with the built-in list so nothing waits on it. */
export function usePaymentModes(userId: string): PaymentMode[] {
  const [modes, setModes] = useState<PaymentMode[]>(FALLBACK_PAYMENT_MODES);

  useEffect(() => {
    let cancelled = false;
    fetchPaymentModes()
      .then((rows) => {
        if (!cancelled && rows.length) setModes(rows);
      })
      .catch(() => {
        /* keep the built-in list */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return modes;
}
