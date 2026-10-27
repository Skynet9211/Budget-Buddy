import * as React from "react"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/** A panel. Renders a <section> unless `asChild` hands the styles to its child (a form, a div...). */
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"section"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "section"
  return (
    <Comp
      data-slot="card"
      className={cn("rounded-xl border bg-card p-4 text-card-foreground shadow-card", className)}
      {...props}
    />
  )
}

/** Title row of a card: heading on the left, controls on the right, wrapping on narrow screens. */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("mb-2.5 flex flex-wrap items-center justify-between gap-2 [&>h2]:mb-0", className)}
      {...props}
    />
  )
}

export { Card, CardHeader }
