import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const messageVariants = cva("text-[0.9rem]", {
  variants: {
    kind: {
      hint: "mt-0.5 text-muted-foreground",
      info: "mt-2.5 text-heading",
      success: "mt-2.5 font-bold text-credit",
      error: "mt-2.5 text-destructive",
      /** Centred placeholder for an empty list or chart. */
      empty: "py-4 text-center text-base text-muted-foreground",
    },
  },
  defaultVariants: { kind: "hint" },
})

/** Status and helper text: hints, progress, success and error messages, empty states. */
function Message({ className, kind, ...props }: React.ComponentProps<"p"> & VariantProps<typeof messageVariants>) {
  return <p data-slot="message" className={cn(messageVariants({ kind }), className)} {...props} />
}

export { Message, messageVariants }
