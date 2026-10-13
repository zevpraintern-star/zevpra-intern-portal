"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * What the visitor gets:
 *  - "pending": capability checks have not run yet (server render and first paint)
 *  - "full":    complete 3D world
 *  - "lite":    same world with fewer particles and a lower pixel ratio
 *  - "static":  no WebGL at all: a lightweight illustration instead
 */
export type WorldMode = "pending" | "full" | "lite" | "static";
export type FxPreference = "auto" | "lite" | "off";

const STORAGE_KEY = "ip_fx";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function isConstrainedDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const smallScreen = window.matchMedia("(max-width: 767px)").matches;
  const fewCores = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  return smallScreen || fewCores || lowMemory;
}

function readPreference(): FxPreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "lite" || value === "off" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function useWorldMode() {
  const [mode, setMode] = useState<WorldMode>("pending");
  const [preference, setPreferenceState] = useState<FxPreference>("auto");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    setPreferenceState(readPreference());
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || preference === "off" || !hasWebGL()) {
      setMode("static");
    } else if (preference === "lite" || isConstrainedDevice()) {
      setMode("lite");
    } else {
      setMode("full");
    }
  }, [reducedMotion, preference]);

  const setPreference = useCallback((value: FxPreference) => {
    setPreferenceState(value);
    try {
      if (value === "auto") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage can be blocked; the choice simply will not persist.
    }
  }, []);

  return { mode, preference, setPreference, reducedMotion };
}
