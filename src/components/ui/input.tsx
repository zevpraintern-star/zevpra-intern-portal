import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Text input. Always pair with a <Label> (or aria-label) and set
 * `aria-invalid` plus `aria-describedby` when a validation error is shown, so the
 * message is announced by screen readers.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = "text", ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        // Browser extensions (e.g. 1Password) inject attributes such as
        // `fdprocessedid` into form controls before React hydrates, causing an
        // attribute-only mismatch. Ignore that on the element itself.
        suppressHydrationWarning
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:outline-destructive",
          "file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 5, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        suppressHydrationWarning
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive",
          className,
        )}
        {...props}
      />
    );
  },
);
