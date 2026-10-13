"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { ScenePalette } from "./palette";
import { getPathCurve } from "./path";
import { worldState } from "./world-state";

const FORWARD = new THREE.Vector3(0, 0, 1);

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = distance(vUv, vec2(0.5)) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uStrength;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** The warm gateway at the end of the flight, plus a low "sunrise" beyond it. */
export function Portal({ palette }: { palette: ScenePalette }) {
  const curve = useMemo(() => getPathCurve(), []);
  const root = useRef<THREE.Group>(null);
  const rings = useRef<Array<THREE.Mesh | null>>([]);
  const blending = palette.additive ? THREE.AdditiveBlending : THREE.NormalBlending;

  const { portalPosition, portalQuat, horizonPosition } = useMemo(() => {
    const t = 0.93;
    const tangent = curve.getTangentAt(t).normalize();
    const end = curve.getPointAt(1);
    return {
      portalPosition: curve.getPointAt(t),
      portalQuat: new THREE.Quaternion().setFromUnitVectors(FORWARD, tangent),
      horizonPosition: end.clone().addScaledVector(curve.getTangentAt(1).normalize(), 46),
    };
  }, [curve]);

  const glowUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color() }, uStrength: { value: 0.6 } }),
    [],
  );

  useFrame((state) => {
    const t = worldState.target;
    const visible = t > 0.74;
    if (root.current) root.current.visible = visible;
    if (!visible) return;
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      ring.rotation.z = state.clock.elapsedTime * (0.12 + i * 0.07) * (i % 2 ? -1 : 1);
    });
    glowUniforms.uColor.value.set(palette.warm);
    glowUniforms.uStrength.value = (palette.additive ? 0.75 : 0.45) * palette.glow;
  });

  const radii = [2.2, 3.1, 4.1, 5.4];

  return (
    <group ref={root}>
      <group position={portalPosition} quaternion={portalQuat}>
        {radii.map((radius, i) => (
          <mesh
            key={radius}
            ref={(node) => {
              rings.current[i] = node;
            }}
          >
            <torusGeometry args={[radius, 0.035 + i * 0.012, 10, 140]} />
            <meshBasicMaterial
              color={i % 2 ? palette.secondary : palette.warm}
              transparent
              opacity={0.85 * palette.glow}
              blending={blending}
              depthWrite={false}
            />
          </mesh>
        ))}
        <mesh>
          <circleGeometry args={[2.2, 48]} />
          <shaderMaterial
            uniforms={glowUniforms}
            vertexShader={GLOW_VERTEX}
            fragmentShader={GLOW_FRAGMENT}
            transparent
            depthWrite={false}
            blending={blending}
          />
        </mesh>
      </group>

      <mesh position={horizonPosition} scale={34}>
        <circleGeometry args={[1, 64]} />
        <shaderMaterial
          uniforms={glowUniforms}
          vertexShader={GLOW_VERTEX}
          fragmentShader={GLOW_FRAGMENT}
          transparent
          depthWrite={false}
          blending={blending}
        />
      </mesh>
    </group>
  );
}
