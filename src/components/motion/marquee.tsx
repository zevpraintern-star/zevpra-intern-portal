import { cn } from "@/lib/utils/cn";

/**
 * Infinitely scrolling strip. Pure CSS (see .marquee-track in globals.css): no
 * JavaScript, pauses on hover, and the duplicate copy is hidden from assistive tech.
 */
export function Marquee({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  if (items.length === 0) return null;
  const row = (hidden: boolean) => (
    <ul
      className="flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {items.map((item) => (
        <li key={`${hidden}-${item}`} className="flex items-center gap-10 whitespace-nowrap">
          <span>{item}</span>
          <span className="size-1.5 rounded-full bg-primary/60" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className={cn(
        "marquee group overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]",
        className,
      )}
    >
      <div className="marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
