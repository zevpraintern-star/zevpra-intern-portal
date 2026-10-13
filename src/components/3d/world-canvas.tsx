"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils/cn";

import { StaticBackdrop } from "./static-backdrop";
import { useScrollDriver } from "./use-scroll-driver";
import { useWorldMode, type FxPreference } from "./use-world-mode";

// three.js, react-three-fiber and the scene are split into their own chunk and are
// never part of the server render or the initial bundle.
const WorldScene = dynamic(() => import("./world-scene"), { ssr: false });

const OPTIONS: ReadonlyArray<{ value: FxPreference; label: string; hint: string }> = [
  { value: "auto", label: "Full", hint: "Best quality for this device" },
  { value: "lite", label: "Lite", hint: "Fewer particles, smoother on older devices" },
  { value: "off", label: "Off", hint: "Static background, no animation" },
];

/**
 * Fixed full-viewport layer behind the page. Always renders the static backdrop
 * first; the 3D world fades in on top once WebGL is confirmed and the chunk is ready.
 */
export function WorldCanvas() {
  const { resolvedTheme } = useTheme();
  const { mode, preference, setPreference, reducedMotion } = useWorldMode();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const live = mode === "full" || mode === "lite";
  useScrollDriver(live);

  const theme = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    if (!live) setReady(false);
  }, [live]);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className={cn("absolute inset-0 transition-opacity duration-1000", live && ready ? "opacity-0" : "opacity-100")}>
          <StaticBackdrop />
        </div>
        {live ? (
          <div className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
            <WorldScene
              key={mode}
              theme={theme}
              quality={mode === "lite" ? "lite" : "full"}
              onReady={() => setReady(true)}
            />
          </div>
        ) : null}
      </div>

      <div className="no-print fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
        {menuOpen ? (
          <div
            role="radiogroup"
            aria-label="Visual effects"
            className="w-56 rounded-xl border border-border bg-popover/90 p-1.5 text-sm shadow-xl backdrop-blur-xl"
          >
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={preference === option.value}
                onClick={() => {
                  setPreference(option.value);
                  setMenuOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent",
                  preference === option.value && "bg-accent text-accent-foreground",
                )}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </button>
            ))}
            {reducedMotion ? (
              <p className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
                Your device asks for reduced motion, so effects stay off.
              </p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-label="Visual effects settings"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-popover/80 text-muted-foreground shadow-lg backdrop-blur-xl transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
