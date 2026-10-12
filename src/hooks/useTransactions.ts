import { useCallback, useEffect, useState } from "react";
import { deleteTransaction, fetchTransactions, type Transaction } from "../lib/transactions";

export function useTransactions(userId: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTransactions(await fetchTransactions());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, userId]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteTransaction(id);
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [refresh],
  );

  return { transactions, loading, error, refresh, remove };
}
