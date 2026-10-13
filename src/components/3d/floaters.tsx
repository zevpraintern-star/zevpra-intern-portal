"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { ScenePalette } from "./palette";
import { getPathCurve, mulberry32 } from "./path";

type Shape = "ico" | "octa" | "knot" | "box" | "tetra";
const SHAPES: readonly Shape[] = ["ico", "octa", "knot", "box", "tetra"];

interface FloaterData {
  position: THREE.Vector3;
  shape: Shape;
  scale: number;
  spin: THREE.Vector3;
  bob: number;
  color: number;
}

/**
 * Wireframe solids drifting alongside the path: small, slow and unlabelled. They add
 * parallax and depth during the flight without carrying any meaning.
 */
export function Floaters({ palette, lite }: { palette: ScenePalette; lite: boolean }) {
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const count = lite ? 12 : 28;

  const items = useMemo<FloaterData[]>(() => {
    const curve = getPathCurve();
    const rand = mulberry32(55);
    return Array.from({ length: count }, (_, i) => {
      const u = 0.04 + rand() * 0.92;
      const base = curve.getPointAt(u);
      const angle = rand() * Math.PI * 2;
      const radius = 7 + rand() * 9;
      return {
        position: new THREE.Vector3(
          base.x + Math.cos(angle) * radius,
          base.y + Math.sin(angle) * radius * 0.6,
          base.z,
        ),
        shape: SHAPES[i % SHAPES.length] as Shape,
        scale: 0.3 + rand() * 0.45,
        spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8),
        bob: rand() * Math.PI * 2,
        color: i % 3,
      };
    });
  }, [count]);

  const colors = [palette.primary, palette.secondary, palette.warm];

  useFrame((state, delta) => {
    items.forEach((item, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.rotation.x += item.spin.x * delta;
      mesh.rotation.y += item.spin.y * delta;
      mesh.rotation.z += item.spin.z * delta;
      mesh.position.y = item.position.y + Math.sin(state.clock.elapsedTime * 0.5 + item.bob) * 0.35;
    });
  });

  return (
    <>
      {items.map((item, i) => (
        <mesh
          key={i}
          ref={(node) => {
            refs.current[i] = node;
          }}
          position={item.position}
          scale={item.scale}
        >
          {item.shape === "ico" && <icosahedronGeometry args={[1, 0]} />}
          {item.shape === "octa" && <octahedronGeometry args={[1, 0]} />}
          {item.shape === "knot" && <torusKnotGeometry args={[0.7, 0.18, 64, 8]} />}
          {item.shape === "box" && <boxGeometry args={[1.3, 1.3, 1.3]} />}
          {item.shape === "tetra" && <tetrahedronGeometry args={[1.1, 0]} />}
          <meshBasicMaterial
            color={colors[item.color] as string}
            wireframe
            transparent
            opacity={palette.additive ? 0.55 : 0.5}
          />
        </mesh>
      ))}
    </>
  );
}
