import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { FieldError } from "@/components/forms/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

const control =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function Field({ label, name, hint, children, className }: { label: string; name: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={name}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError name={name} />
    </div>
  );
}

export function TextField({ label, name, hint, className, ...props }: { label: string; name: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <Input id={name} name={name} aria-describedby={`${name}-error`} {...props} />
    </Field>
  );
}

export function TextArea({ label, name, hint, rows = 5, className, ...props }: { label: string; name: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <textarea id={name} name={name} rows={rows} aria-describedby={`${name}-error`} className={cn(control, "min-h-24")} {...props} />
    </Field>
  );
}

export function SelectField({ label, name, hint, options, className, ...props }: { label: string; name: string; hint?: string; options: ReadonlyArray<{ value: string; label: string }> } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <select id={name} name={name} aria-describedby={`${name}-error`} className={cn(control, "h-10")} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" id={name} name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-input accent-[var(--color-primary)]" />
        <span>{label}{hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}</span>
      </label>
      <FieldError name={name} />
    </div>
  );
}
