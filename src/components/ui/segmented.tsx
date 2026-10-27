import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

const segmentedVariants = cva("flex", {
  variants: {
    variant: {
      /** Tinted track with the selected item raised on a card (tabs, date presets). */
      pill: "flex-wrap gap-1 rounded-md bg-secondary p-1",
      /** Side-by-side bordered boxes (debit / credit). */
      outline: "gap-2",
      /** Wrapping row of round tags, usually multi-select. */
      chip: "flex-wrap gap-1.5",
    },
  },
  defaultVariants: { variant: "pill" },
})

/** Also used directly by router links that should look like segmented items (see the `on:` variant in index.css). */
const segmentedItemVariants = cva(
  "inline-flex items-center justify-center font-bold no-underline outline-none transition-[background-color,color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        pill: "rounded-sm text-muted-foreground hover:text-heading on:bg-card on:text-heading on:shadow-card",
        outline: "min-h-[46px] flex-1 rounded-md border-[1.5px] border-border bg-surface px-3 text-muted-foreground",
        chip: "min-h-[34px] rounded-full border-[1.5px] border-border bg-surface px-3 text-[0.85rem] text-muted-foreground on:border-primary on:bg-primary on:text-primary-foreground",
      },
      size: { sm: "", md: "" },
      tone: {
        default: "",
        debit: "on:border-destructive on:bg-debit-bg on:text-destructive",
        credit: "on:border-success on:bg-credit-bg on:text-credit",
      },
    },
    compoundVariants: [
      { variant: "pill", size: "sm", className: "min-h-9 px-3 text-[0.85rem]" },
      { variant: "pill", size: "md", className: "min-h-[42px] flex-1 rounded-[11px] px-3 text-base" },
    ],
    defaultVariants: { variant: "pill", size: "sm", tone: "default" },
  }
)

type ItemStyle = Pick<VariantProps<typeof segmentedItemVariants>, "variant" | "size">

const SegmentedContext = React.createContext<ItemStyle>({})

function Segmented({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & ItemStyle) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="segmented"
      className={cn(segmentedVariants({ variant }), className)}
      {...props}
    >
      <SegmentedContext.Provider value={{ variant, size }}>{children}</SegmentedContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function SegmentedItem({
  className,
  tone,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & Pick<VariantProps<typeof segmentedItemVariants>, "tone">) {
  const { variant, size } = React.useContext(SegmentedContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(segmentedItemVariants({ variant, size, tone }), className)}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem, segmentedVariants, segmentedItemVariants }
