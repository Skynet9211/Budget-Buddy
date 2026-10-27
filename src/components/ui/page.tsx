import * as React from "react"
import { cn } from "@/lib/utils"

/** The centred, phone-width column every screen sits in. Bottom room keeps the floating button off the last item. */
function Page({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="page"
      className={cn(
        "mx-auto flex max-w-[560px] flex-col gap-4 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  )
}

export { Page }
