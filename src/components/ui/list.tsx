import * as React from "react"
import { cn } from "@/lib/utils"

function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="list" className={cn("mt-2 flex flex-col gap-2", className)} {...props} />
}

/** A bordered row: usually an emoji, a name that takes the free space, then icon buttons. */
function ListItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="list-item"
      className={cn("flex items-center gap-2.5 rounded-lg border bg-surface px-3 py-2", className)}
      {...props}
    />
  )
}

function ListEmoji({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="list-emoji"
      className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xl", className)}
      {...props}
    />
  )
}

export { List, ListItem, ListEmoji }
