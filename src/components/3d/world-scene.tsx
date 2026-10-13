"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";

import { CameraRig } from "./camera-rig";
import { DomainConstellation } from "./constellation";
import { Floaters } from "./floaters";
import { JourneyGates } from "./gates";
import { Globe } from "./globe";
import { PALETTES, type SceneTheme } from "./palette";
import { Portal } from "./portal";
import { Starfield } from "./starfield";

export type WorldQuality = "full" | "lite";

interface WorldSceneProps {
  theme: SceneTheme;
  quality: WorldQuality;
  onReady: () => void;
}

/**
 * The 3D world. Loaded with next/dynamic (ssr: false) so none of three.js is part of
 * the initial JavaScript: the page is readable and interactive before this arrives.
 */
export default function WorldScene({ theme, quality, onReady }: WorldSceneProps) {
  const palette = PALETTES[theme];
  const lite = quality === "lite";
  const [dpr, setDpr] = useState<[number, number]>(lite ? [1, 1.25] : [1, 1.75]);
  const introStart = useMemo(() => 0.15, []);

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: !lite, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 0.1, far: 420, position: [0, 0.6, 10] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        onReady();
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      {/* Drops resolution automatically if the device cannot hold frame rate. */}
      <PerformanceMonitor
        onDecline={() => setDpr([1, 1])}
        onIncline={() => setDpr(lite ? [1, 1.25] : [1, 1.75])}
      />
      <fogExp2 attach="fog" args={[palette.fog, 0.0075]} />

      <CameraRig introStart={introStart} />
      <Starfield palette={palette} lite={lite} />
      <Globe palette={palette} lite={lite} introStart={introStart} />
      <DomainConstellation palette={palette} lite={lite} />
      <JourneyGates palette={palette} lite={lite} />
      <Floaters palette={palette} lite={lite} />
      <Portal palette={palette} />
    </Canvas>
  );
}
