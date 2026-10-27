import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The round accent mic button next to a text input. `live` turns it red and pulsing while recording. */
export default function MicButton({ live = false, className, ...props }: ComponentProps<"button"> & { live?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-[52px] shrink-0 place-items-center rounded-full bg-primary p-0 text-[1.3rem] text-primary-foreground shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50",
        live && "animate-mic-pulse bg-destructive motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
