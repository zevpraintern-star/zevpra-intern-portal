"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { getDotTexture } from "./dot-texture";
import type { ScenePalette } from "./palette";
import { getPathCurve, mulberry32 } from "./path";
import { worldState } from "./world-state";

interface ClusterSpec {
  /** Position on the camera path this cluster hangs beside. */
  t: number;
  /** +1 places the cluster to the right of the path, -1 to the left. */
  side: 1 | -1;
  lift: number;
}

/** How far ahead of the camera (as a path fraction) a cluster hangs when its panel is on screen. */
const LEAD = 0.046;

/** One cluster per domain colour. Panels on the page alternate sides to match. */
const CLUSTERS: readonly ClusterSpec[] = [
  { t: 0.205, side: 1, lift: 1.2 },
  { t: 0.262, side: -1, lift: -1.0 },
  { t: 0.318, side: 1, lift: 0.9 },
  { t: 0.37, side: -1, lift: -0.7 },
];

interface ClusterData {
  center: THREE.Vector3;
  nodes: Float32Array;
  edges: Float32Array;
  t: number;
}

function buildCluster(spec: ClusterSpec, index: number, nodeCount: number): ClusterData {
  const curve = getPathCurve();
  const rand = mulberry32(100 + index * 13);
  const anchor = Math.min(1, spec.t + LEAD);
  const base = curve.getPointAt(anchor);
  const tangent = curve.getTangentAt(anchor);
  const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
  const center = base.clone().addScaledVector(side, spec.side * 4.4);
  center.y += spec.lift;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.cbrt(rand()) * 3.3;
    const s = Math.sqrt(1 - u * u);
    points.push(new THREE.Vector3(r * s * Math.cos(phi), r * u, r * s * Math.sin(phi)));
  }

  const edges: number[] = [];
  points.forEach((a, i) => {
    const nearest = points
      .map((b, j) => ({ j, d: a.distanceToSquared(b) }))
      .filter(({ j }) => j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    nearest.forEach(({ j }) => {
      const b = points[j] as THREE.Vector3;
      edges.push(a.x, a.y, a.z, b.x, b.y, b.z);
    });
  });

  const nodes = new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]));
  return { center, nodes, edges: new Float32Array(edges), t: spec.t };
}

export function DomainConstellation({
  palette,
  lite,
}: {
  palette: ScenePalette;
  lite: boolean;
}) {
  const clusters = useMemo(
    () => CLUSTERS.map((spec, i) => buildCluster(spec, i, lite ? 16 : 30)),
    [lite],
  );
  const groups = useRef<Array<THREE.Group | null>>([]);
  const hubs = useRef<Array<THREE.Mesh | null>>([]);
  const blending = palette.additive ? THREE.AdditiveBlending : THREE.NormalBlending;

  useFrame((state, delta) => {
    const t = worldState.target;
    clusters.forEach((cluster, i) => {
      const group = groups.current[i];
      if (!group) return;
      const near = t > cluster.t - 0.085 && t < cluster.t + 0.065;
      group.visible = near;
      if (!near) return;
      group.rotation.y += delta * (0.18 + i * 0.03);
      group.rotation.x = Math.sin(state.clock.elapsedTime * 0.2 + i) * 0.15;
      const hub = hubs.current[i];
      if (hub) hub.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.6 + i * 1.3) * 0.1);
    });
  });

  return (
    <>
      {clusters.map((cluster, i) => {
        const color = palette.domains[i] as string;
        return (
          <group
            key={i}
            ref={(node) => {
              groups.current[i] = node;
            }}
            position={cluster.center}
          >
            <lineSegments>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[cluster.edges, 3]} />
              </bufferGeometry>
              <lineBasicMaterial
                color={color}
                transparent
                opacity={0.45 * palette.glow}
                blending={blending}
                depthWrite={false}
              />
            </lineSegments>

            <points>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[cluster.nodes, 3]} />
              </bufferGeometry>
              <pointsMaterial
            map={getDotTexture()}
                color={color}
                size={0.3}
                sizeAttenuation
                transparent
                opacity={0.95}
                blending={blending}
                depthWrite={false}
              />
            </points>
            <points>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[cluster.nodes, 3]} />
              </bufferGeometry>
              <pointsMaterial
            map={getDotTexture()}
                color={color}
                size={1.1}
                sizeAttenuation
                transparent
                opacity={0.16 * palette.glow}
                blending={blending}
                depthWrite={false}
              />
            </points>

            <mesh
              ref={(node) => {
                hubs.current[i] = node;
              }}
            >
              <icosahedronGeometry args={[0.9, 1]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.85} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.34, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
