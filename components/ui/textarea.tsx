import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[20px] border border-line bg-glass px-4 py-3 text-base hover:border-ink-3 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ink focus-visible:bg-raised focus-visible:ring-4 focus-visible:ring-butter/40 disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken disabled:text-ink-disabled aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
