"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { getDotTexture } from "./dot-texture";
import type { ScenePalette } from "./palette";
import { getPathCurve } from "./path";
import { gateT, JOURNEY_STEP_COUNT, STAGE_RANGES, worldState } from "./world-state";

const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * Six rings, one per journey step, strung on a light ribbon. The ring nearest the
 * camera brightens and swells as you pass through it, which is what ties the
 * on-page step card to the flight.
 */
export function JourneyGates({ palette, lite }: { palette: ScenePalette; lite: boolean }) {
  const curve = useMemo(() => getPathCurve(), []);
  const root = useRef<THREE.Group>(null);
  const gateGroups = useRef<Array<THREE.Group | null>>([]);
  const outerMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const sparks = useRef<THREE.Points>(null);
  const blending = palette.additive ? THREE.AdditiveBlending : THREE.NormalBlending;

  const gates = useMemo(
    () =>
      Array.from({ length: JOURNEY_STEP_COUNT }, (_, i) => {
        const t = gateT(i);
        const position = curve.getPointAt(t);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          FORWARD,
          curve.getTangentAt(t).normalize(),
        );
        return { t, position, quaternion };
      }),
    [curve],
  );

  const ribbon = useMemo(() => {
    const [from, to] = STAGE_RANGES.journey;
    const points: THREE.Vector3[] = [];
    const samples = 140;
    for (let i = 0; i <= samples; i += 1) {
      points.push(curve.getPointAt(from + ((to - from) * i) / samples));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 360, 0.03, 6, false);
  }, [curve]);

  const sparkCount = lite ? 16 : 44;
  const sparkPositions = useMemo(() => new Float32Array(sparkCount * 3), [sparkCount]);

  const dotRing = useMemo(() => {
    const count = 72;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * 4.5;
      positions[i * 3 + 1] = Math.sin(angle) * 4.5;
    }
    return positions;
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = worldState.target;
    const [from, to] = STAGE_RANGES.journey;
    const visible = t > from - 0.12 && t < to + 0.08;
    if (root.current) root.current.visible = visible;
    if (!visible) return;

    gates.forEach((gate, i) => {
      const group = gateGroups.current[i];
      if (!group) return;
      const distance = (t - gate.t) / 0.022;
      const near = Math.exp(-distance * distance);
      group.scale.setScalar(1 + near * 0.18);
      group.rotation.z = state.clock.elapsedTime * (0.08 + i * 0.015) * (i % 2 ? 1 : -1);
      const material = outerMaterials.current[i];
      if (material) material.opacity = (0.4 + near * 0.6) * palette.glow;
    });

    const points = sparks.current;
    if (points) {
      const attribute = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < sparkCount; k += 1) {
        const phase = (state.clock.elapsedTime * 0.035 + k / sparkCount) % 1;
        curve.getPointAt(from + (to - from) * phase, tmp);
        attribute.setXYZ(k, tmp.x, tmp.y, tmp.z);
      }
      attribute.needsUpdate = true;
    }
  });

  return (
    <group ref={root}>
      <mesh geometry={ribbon}>
        <meshBasicMaterial
          color={palette.primary}
          transparent
          opacity={0.5 * palette.glow}
          blending={blending}
          depthWrite={false}
        />
      </mesh>

      {gates.map((gate, i) => (
        <group key={i} position={gate.position} quaternion={gate.quaternion}>
          <group
            ref={(node) => {
              gateGroups.current[i] = node;
            }}
          >
            <mesh>
              <torusGeometry args={[3.5, 0.075, 12, 120]} />
              <meshBasicMaterial
                ref={(node) => {
                  outerMaterials.current[i] = node;
                }}
                color={palette.primary}
                transparent
                blending={blending}
                depthWrite={false}
              />
            </mesh>
            <mesh>
              <torusGeometry args={[3.95, 0.02, 8, 120]} />
              <meshBasicMaterial
                color={palette.secondary}
                transparent
                opacity={0.7 * palette.glow}
                blending={blending}
                depthWrite={false}
              />
            </mesh>
            <points>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[dotRing, 3]} />
              </bufferGeometry>
              <pointsMaterial
            map={getDotTexture()}
                color={palette.warm}
                size={0.16}
                sizeAttenuation
                transparent
                opacity={0.9}
                blending={blending}
                depthWrite={false}
              />
            </points>
          </group>
        </group>
      ))}

      <points ref={sparks} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparkPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
            map={getDotTexture()}
          color={palette.warm}
          size={0.15}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={blending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
