import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { List, ListEmoji, ListItem } from "@/components/ui/list";
import { Message } from "@/components/ui/message";
import { cn } from "@/lib/utils";
import { emojiFor } from "../lib/categories";
import { paymentModeName } from "../lib/paymentModes";
import { formatDate, formatMoney, type Transaction } from "../lib/transactions";
import type { PaymentMode } from "../types";

interface Props {
  transactions: Transaction[];
  paymentModes: PaymentMode[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
}

export default function TransactionList({ transactions, paymentModes, loading, onDelete }: Props) {
  const [confirm, confirmDialog] = useConfirm();
  const spent = transactions.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const received = transactions.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);

  return (
    <Card>
      <h2>
        Transactions {transactions.length > 0 && <Badge variant="secondary">{transactions.length}</Badge>}
      </h2>

      {transactions.length > 0 && (
        <div className="my-2 flex gap-2.5">
          <div className="flex flex-1 flex-col rounded-lg border bg-surface px-3 py-2">
            <span className="text-xs text-muted-foreground">Spent</span>
            <strong className="text-destructive">{formatMoney(spent)}</strong>
          </div>
          <div className="flex flex-1 flex-col rounded-lg border bg-surface px-3 py-2">
            <span className="text-xs text-muted-foreground">Received</span>
            <strong className="text-credit">{formatMoney(received)}</strong>
          </div>
        </div>
      )}

      {loading && <Message>Loading...</Message>}
      {!loading && transactions.length === 0 && (
        <Message kind="empty">No transactions yet. Say or type your first one above ✨</Message>
      )}

      <List>
        {transactions.map((t) => (
          <ListItem key={t.id}>
            <Link
              to={`/transactions/${t.id}`}
              className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-sm text-inherit no-underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ListEmoji>{emojiFor(t.category?.name ?? t.party ?? "")}</ListEmoji>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold wrap-anywhere group-hover:text-heading group-focus-visible:text-heading">
                  {t.party ?? t.category?.name ?? "Transaction"}
                </span>
                <span className="text-[0.8rem] text-muted-foreground wrap-anywhere">
                  {t.category ? `${t.category.name} · ` : ""}
                  {paymentModeName(t.paymentMode, paymentModes)} · {formatDate(t.date)}
                </span>
              </div>
              <strong className={cn("text-[0.95rem] whitespace-nowrap", t.type === "debit" ? "text-destructive" : "text-credit")}>
                {t.type === "debit" ? "−" : "+"}
                {formatMoney(t.amount, t.currency)}
              </strong>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="hover:text-destructive"
              aria-label="Delete transaction"
              onClick={async () => {
                if (await confirm({ title: "Delete this transaction?" })) await onDelete(t.id);
              }}
            >
              🗑
            </Button>
          </ListItem>
        ))}
      </List>
      {confirmDialog}
    </Card>
  );
}
