import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Inline feedback block used for form errors, success confirmations and policy
 * notices. Uses role="alert" for errors so assistive technology announces them.
 */
const alertVariants = cva("relative w-full rounded-lg border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-muted text-foreground",
      success: "border-success/40 bg-success/10 text-foreground",
      warning: "border-warning/50 bg-warning/10 text-foreground",
      destructive: "border-destructive/50 bg-destructive/10 text-foreground",
    },
  },
  defaultVariants: { variant: "info" },
});

export type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    title?: string;
    children: ReactNode;
  };

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const role = variant === "destructive" || variant === "warning" ? "alert" : "status";

  return (
    <div role={role} className={cn(alertVariants({ variant }), className)} {...props}>
      {title ? <p className="mb-1 font-medium">{title}</p> : null}
      <div className="[&_p]:leading-relaxed">{children}</div>
    </div>
  );
}
