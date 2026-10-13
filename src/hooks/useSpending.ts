import { useCallback, useEffect, useState } from "react";
import { fetchSpending } from "../lib/transactions";
import type { Expense } from "../types";

/**
 * All of the user's spending for the dashboard. Loads (and reloads) whenever `active` becomes true,
 * so the dashboard is fresh after transactions are added or deleted on another tab.
 */
export function useSpending(userId: string, active: boolean) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setExpenses(await fetchSpending());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh, userId]);

  return { expenses, loading, error, refresh };
}
