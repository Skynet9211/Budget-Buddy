import { useCallback, useEffect, useState } from "react";
import { fetchPaymentFlows } from "../lib/transactions";
import type { PaymentFlow } from "../types";

/** Every transaction (debit and credit) with its mode of payment, for the dashboard's chart. */
export function usePaymentFlows(userId: string, active: boolean) {
  const [flows, setFlows] = useState<PaymentFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setFlows(await fetchPaymentFlows());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh, userId]);

  return { flows, loading, error, refresh };
}
