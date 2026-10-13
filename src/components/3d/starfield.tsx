"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import type { ScenePalette } from "./palette";
import { getPathCurve, mulberry32 } from "./path";

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPx;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    vTwinkle = 0.62 + 0.38 * sin(uTime * aSpeed + aPhase);
    gl_PointSize = clamp(aSize * uPx * (64.0 / -mv.z), 1.0, 26.0 * uPx);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor, a * vTwinkle * uAlpha);
  }
`;

/**
 * Dust and stars distributed around the whole camera path, so there is always
 * something streaming past the lens during the flight.
 */
export function Starfield({ palette, lite }: { palette: ScenePalette; lite: boolean }) {
  const gl = useThree((state) => state.gl);
  const count = lite ? 1100 : 3600;

  const data = useMemo(() => {
    const curve = getPathCurve();
    const rand = mulberry32(21);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palettePool = [
      new THREE.Color(palette.primary),
      new THREE.Color(palette.secondary),
      new THREE.Color(palette.warm),
      new THREE.Color(palette.additive ? "#ffffff" : palette.primary),
    ];
    const tmp = new THREE.Vector3();

    for (let i = 0; i < count; i += 1) {
      const u = Math.min(1, Math.max(0, rand() * 1.04 - 0.02));
      curve.getPointAt(u, tmp);
      const angle = rand() * Math.PI * 2;
      const radius = 3.2 + Math.pow(rand(), 0.7) * 30;
      positions[i * 3] = tmp.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = tmp.y + Math.sin(angle) * radius * 0.7;
      positions[i * 3 + 2] = tmp.z + (rand() - 0.5) * 8;
      sizes[i] = 0.5 + rand() * 1.7;
      phases[i] = rand() * Math.PI * 2;
      speeds[i] = 0.6 + rand() * 2.2;
      const pick = palettePool[Math.floor(rand() * palettePool.length)] as THREE.Color;
      colors[i * 3] = pick.r;
      colors[i * 3 + 1] = pick.g;
      colors[i * 3 + 2] = pick.b;
    }
    return { positions, sizes, phases, speeds, colors };
  }, [count, palette]);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPx: { value: 1 }, uAlpha: { value: 1 } }),
    [],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uPx.value = gl.getPixelRatio();
    uniforms.uAlpha.value = palette.additive ? 0.9 : 0.75;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[data.sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[data.phases, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[data.speeds, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[data.colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        blending={palette.additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}
