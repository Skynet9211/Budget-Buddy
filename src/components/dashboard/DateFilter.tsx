import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { ALL_TIME_START, addDays, oneMonthAgo, toISO, todayISO } from "../../lib/dates";

export type PresetId = "7d" | "1m" | "3m" | "ytd" | "all" | "custom";

export interface DateRange {
  preset: PresetId;
  from: string;
  to: string;
}

const PRESETS: Array<{ id: Exclude<PresetId, "custom">; label: string }> = [
  { id: "7d", label: "7 days" },
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "ytd", label: "This year" },
  { id: "all", label: "All time" },
];

export function rangeForPreset(preset: Exclude<PresetId, "custom">): DateRange {
  const today = new Date();
  const to = toISO(today);
  switch (preset) {
    case "7d":
      return { preset, from: toISO(addDays(today, -6)), to };
    case "1m":
      return { preset, from: toISO(oneMonthAgo(today)), to };
    case "3m":
      return { preset, from: toISO(oneMonthAgo(oneMonthAgo(oneMonthAgo(today)))), to };
    case "ytd":
      return { preset, from: toISO(new Date(today.getFullYear(), 0, 1)), to };
    case "all":
      return { preset, from: ALL_TIME_START, to };
  }
}

/** Default filter: the last month. */
export const defaultRange = (): DateRange => rangeForPreset("1m");

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export default function DateFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        type="single"
        className="self-start"
        value={value.preset === "custom" ? "" : value.preset}
        onValueChange={(v) => v && onChange(rangeForPreset(v as Exclude<PresetId, "custom">))}
        aria-label="Date range"
      >
        {PRESETS.map((p) => (
          <SegmentedItem key={p.id} value={p.id}>
            {p.label}
          </SegmentedItem>
        ))}
      </Segmented>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="From" className="text-[0.8rem]">
          <Input
            type="date"
            value={value.from}
            max={value.to}
            onChange={(e) =>
              e.target.value && onChange({ preset: "custom", from: e.target.value, to: value.to })
            }
          />
        </Field>
        <Field label="To" className="text-[0.8rem]">
          <Input
            type="date"
            value={value.to}
            min={value.from}
            max={todayISO()}
            onChange={(e) =>
              e.target.value && onChange({ preset: "custom", from: value.from, to: e.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}
