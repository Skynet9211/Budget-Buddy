import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Message } from "@/components/ui/message";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PaymentModeTotal } from "../../lib/analytics";
import { formatMoney, formatMoneyCompact } from "../../lib/format";
import { AXIS_TICK, BAR_CURSOR, GRID_STROKE, TOOLTIP_STYLE } from "./SpendOverTime";

/** Money out (debited) and money in (credited) for each mode of payment. Red = debited, green = credited. */
export default function PaymentModeChart({ data }: { data: PaymentModeTotal[] }) {
  if (data.length === 0) return <Message kind="empty" className="py-8">No transactions in this period.</Message>;

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="name" tick={AXIS_TICK} interval={0} />
          <YAxis tick={AXIS_TICK} tickFormatter={formatMoneyCompact} width={56} />
          <Tooltip formatter={(v: number) => formatMoney(v)} cursor={BAR_CURSOR} {...TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
          <Bar dataKey="debit" name="Debited" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="credit" name="Credited" fill="var(--credit)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <Table className="mt-2.5 text-[0.9rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="h-auto px-1 py-1.5 text-[0.8rem] font-bold text-muted-foreground">
              Mode
            </TableHead>
            <TableHead scope="col" className="h-auto px-1 py-1.5 text-right text-[0.8rem] font-bold text-muted-foreground">
              Debited
            </TableHead>
            <TableHead scope="col" className="h-auto px-1 py-1.5 text-right text-[0.8rem] font-bold text-muted-foreground">
              Credited
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((m) => (
            <TableRow key={m.id}>
              <TableHead scope="row" className="h-auto px-1 py-1.5 font-bold whitespace-normal">
                {m.name}{" "}
                <Badge variant="secondary" className="ml-1 text-xs text-muted-foreground">
                  {m.count}
                </Badge>
              </TableHead>
              <TableCell className="px-1 py-1.5 text-right text-destructive tabular-nums">
                {m.debit > 0 ? formatMoney(m.debit) : "—"}
              </TableCell>
              <TableCell className="px-1 py-1.5 text-right text-credit tabular-nums">
                {m.credit > 0 ? formatMoney(m.credit) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
