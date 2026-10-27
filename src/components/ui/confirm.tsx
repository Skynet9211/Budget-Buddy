import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmOptions {
  title: string
  description?: string
  /** Label of the confirming button. Defaults to "Delete". */
  actionLabel?: string
}

/**
 * A promise-based replacement for `window.confirm`. Render the returned `dialog` once, then
 * `if (await confirm({ title: "Delete?" })) ...`.
 */
function useConfirm() {
  const [open, setOpen] = React.useState(false)
  // Kept after closing so the text doesn't vanish during the close animation.
  const [options, setOptions] = React.useState<ConfirmOptions>({ title: "" })
  const resolver = React.useRef<((ok: boolean) => void) | null>(null)

  const settle = React.useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOpen(false)
  }, [])

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const dialog = (
    <AlertDialog open={open} onOpenChange={(next) => !next && settle(false)}>
      <AlertDialogContent size="sm" className="rounded-xl bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="mb-0 text-lg">{options.title}</AlertDialogTitle>
          {options.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => settle(true)}>
            {options.actionLabel ?? "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return [confirm, dialog] as const
}

export { useConfirm }
