export type SceneTheme = "dark" | "light";

export interface ScenePalette {
  /** Fog colour; matches the page background so distant objects dissolve into it. */
  fog: string;
  /** Opaque fill that hides the far side of the globe. */
  globeCore: string;
  /** Domain colours: Computer Science, Electronics, Mechanical, Civil. */
  domains: readonly [string, string, string, string];
  primary: string;
  secondary: string;
  warm: string;
  /** Ocean / background dots. */
  dim: string;
  /** Additive blending glows on dark backgrounds but washes out on light ones. */
  additive: boolean;
  /** Overall opacity multiplier for glow layers. */
  glow: number;
}

export const PALETTES: Record<SceneTheme, ScenePalette> = {
  dark: {
    fog: "#0a0d1f",
    globeCore: "#18205a",
    domains: ["#35e0ea", "#ffb547", "#ff6b6b", "#8cf08c"],
    primary: "#8a6bff",
    secondary: "#35e0ea",
    warm: "#ffb547",
    dim: "#33407f",
    additive: true,
    glow: 1,
  },
  light: {
    fog: "#f4f6fd",
    globeCore: "#e8ebf8",
    domains: ["#0b8aa6", "#c2740a", "#d33a4a", "#2f9a52"],
    primary: "#5136e0",
    secondary: "#0b8aa6",
    warm: "#c2740a",
    dim: "#aab3d8",
    additive: false,
    glow: 0.85,
  },
};
