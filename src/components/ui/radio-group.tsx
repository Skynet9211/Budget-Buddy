import * as React from "react"
import { cn } from "@/lib/utils"
import { CircleIcon } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

/** A whole tappable option box acting as one radio. Put a `RadioGroupIndicator` inside for a checked mark. */
function RadioGroupCard({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-card"
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-lg border-2 border-border bg-surface px-2 py-3 text-center text-foreground transition-[border-color,background-color,transform] hover:border-primary active:scale-[0.98] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-heading data-[state=checked]:border-primary data-[state=checked]:bg-secondary data-[state=checked]:ring-[3px] data-[state=checked]:ring-ring/20 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function RadioGroupIndicator(props: React.ComponentProps<typeof RadioGroupPrimitive.Indicator>) {
  return <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" {...props} />
}

export { RadioGroup, RadioGroupItem, RadioGroupCard, RadioGroupIndicator }
