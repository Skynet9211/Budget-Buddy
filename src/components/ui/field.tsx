import * as React from "react"
import { cn } from "@/lib/utils"

/** A label stacked above its control. The control goes in `children`, so clicking the label focuses it. */
function Field({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"label"> & { label: React.ReactNode }) {
  return (
    <label
      data-slot="field"
      className={cn("flex min-w-0 flex-col gap-1 text-[0.85rem] font-bold text-heading", className)}
      {...props}
    >
      {label}
      {children}
    </label>
  )
}

export { Field }
