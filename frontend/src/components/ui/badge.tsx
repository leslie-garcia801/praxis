import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Pairs reuse the token pairs checked in lib/contraste.test.ts (RNF-09).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-foreground",
        primary: "border-transparent bg-accent text-accent-foreground",
        exito: "border-exito-borde/40 bg-exito text-exito-foreground",
        aviso: "border-aviso-borde/40 bg-aviso text-aviso-foreground",
        info: "border-info-borde/40 bg-info text-info-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        "destructive-solid": "border-transparent bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Badge({
  className,
  variant = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
