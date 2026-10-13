import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"} className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-to-r from-[var(--brand-violet)] to-[var(--brand-cyan)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function DefinitionList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[40rem] text-left text-sm" aria-label={label}>{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cn("whitespace-nowrap border-b border-border bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground", className)}>{children}</th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cn("border-b border-border px-4 py-3 align-top last:border-b-0", className)}>{children}</td>
);

/** Horizontal bars; values are normalised to the largest. Text values are always shown, so colour is never the only signal. */
export function BarList({ data, empty = "No data yet" }: { data: Array<{ label: string; value: number }>; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-3"><span className="truncate">{d.label.replaceAll("_", " ")}</span><span className="font-medium tabular-nums">{d.value}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--brand-violet)]" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({ data, label }: { data: Array<{ label: string; value: number }>; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${data.length * 12} 60`} role="img" aria-label={`${label}: ${total} in total`} className="h-32 w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = (d.value / max) * 52;
          return <rect key={d.label} x={i * 12 + 2} y={58 - h} width={8} height={Math.max(h, d.value ? 2 : 0.6)} rx={1.5} className="fill-[var(--brand-cyan)]"><title>{`${d.label}: ${d.value}`}</title></rect>;
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{data[0]?.label}</span><span>{total} total</span><span>{data[data.length - 1]?.label}</span></figcaption>
    </figure>
  );
}
