"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { getDotTexture } from "./dot-texture";
import type { ScenePalette } from "./palette";
import { mulberry32 } from "./path";
import { worldState } from "./world-state";

const RADIUS = 2.2;

/** Cheap continent-like mask: positive values are "land". Deterministic and seedless. */
function land(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.9 + 1.3) * Math.sin(y * 2.3 + 0.7) +
    Math.sin(z * 2.7 + 2) * Math.sin(x * 1.7 - 1.1) +
    0.5 * Math.sin(y * 5 + z * 3) * Math.cos(x * 4)
  );
}

interface GlobeData {
  positions: Float32Array;
  colors: Float32Array;
  landPoints: THREE.Vector3[];
}

function buildGlobe(count: number, palette: ScenePalette): GlobeData {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const landPoints: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const cool = new THREE.Color(palette.secondary);
  const violet = new THREE.Color(palette.primary);
  const ocean = new THREE.Color(palette.dim);
  const mix = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;
    positions[i * 3] = x * RADIUS;
    positions[i * 3 + 1] = y * RADIUS;
    positions[i * 3 + 2] = z * RADIUS;

    if (land(x, y, z) > 0.12) {
      mix.copy(cool).lerp(violet, ((y + 1) / 2) * 0.75);
      landPoints.push(new THREE.Vector3(x, y, z));
    } else {
      mix.copy(ocean);
    }
    colors[i * 3] = mix.r;
    colors[i * 3 + 1] = mix.g;
    colors[i * 3 + 2] = mix.b;
  }

  return { positions, colors, landPoints };
}

const ARC_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  void main() {
    vT = aT;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARC_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uAlpha;
  varying float vT;
  varying float vSeed;
  void main() {
    float head = fract(uTime * 0.22 + vSeed);
    float behind = mod(head - vT + 1.0, 1.0);
    float pulse = exp(-behind * 10.0);
    float alpha = (0.22 + pulse * 1.0) * uAlpha;
    gl_FragColor = vec4(uColor * (0.8 + pulse * 0.9), alpha);
  }
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.6);
    gl_FragColor = vec4(uColor, rim * uStrength);
  }
`;

function buildArcs(
  landPoints: THREE.Vector3[],
  arcCount: number,
): { positions: Float32Array; t: Float32Array; seed: Float32Array } {
  const rand = mulberry32(7);
  const segments = 56;
  const positions: number[] = [];
  const tValues: number[] = [];
  const seeds: number[] = [];

  for (let a = 0; a < arcCount; a += 1) {
    const from = landPoints[Math.floor(rand() * landPoints.length)];
    const to = landPoints[Math.floor(rand() * landPoints.length)];
    if (!from || !to || from.distanceTo(to) < 0.6) continue;

    const start = from.clone().multiplyScalar(RADIUS * 1.004);
    const end = to.clone().multiplyScalar(RADIUS * 1.004);
    const lift = 1.25 + from.distanceTo(to) * 0.32;
    const control = from.clone().add(to).normalize().multiplyScalar(RADIUS * lift);
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    const points = curve.getPoints(segments);
    const seed = rand();

    for (let s = 0; s < segments; s += 1) {
      const p0 = points[s] as THREE.Vector3;
      const p1 = points[s + 1] as THREE.Vector3;
      positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      tValues.push(s / segments, (s + 1) / segments);
      seeds.push(seed, seed);
    }
  }

  return {
    positions: new Float32Array(positions),
    t: new Float32Array(tValues),
    seed: new Float32Array(seeds),
  };
}

interface GlobeProps {
  palette: ScenePalette;
  lite: boolean;
  introStart: number;
}

export function Globe({ palette, lite, introStart }: GlobeProps) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const arcMaterial = useRef<THREE.ShaderMaterial>(null);
  const size = useThree((state) => state.size);

  const count = lite ? 2200 : 6500;
  const globe = useMemo(() => buildGlobe(count, palette), [count, palette]);
  const arcs = useMemo(
    () => buildArcs(globe.landPoints, lite ? 9 : 30),
    [globe.landPoints, lite],
  );

  const arcUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uAlpha: { value: 1 },
    }),
    [],
  );
  const atmosphereUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color() }, uStrength: { value: 1 } }),
    [],
  );

  const blending = palette.additive ? THREE.AdditiveBlending : THREE.NormalBlending;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    const t = worldState.target;
    // The globe only matters for the first part of the flight.
    g.visible = t < 0.3;
    if (!g.visible) return;

    const wide = size.width / size.height > 1.15;
    const targetX = wide ? 2.5 : 0;
    const targetY = wide ? 0 : 3.1;
    const targetScale = wide ? 1 : 0.66;
    g.position.x = THREE.MathUtils.damp(g.position.x, targetX, 3, delta);
    g.position.y = THREE.MathUtils.damp(g.position.y, targetY, 3, delta);

    const elapsed = state.clock.elapsedTime - introStart;
    const intro = 1 - Math.pow(1 - THREE.MathUtils.clamp(elapsed / 3.2, 0, 1), 4);
    g.scale.setScalar(targetScale * (0.55 + 0.45 * intro));

    if (spin.current) {
      spin.current.rotation.y += delta * (0.05 + (1 - intro) * 1.4);
      spin.current.rotation.x = THREE.MathUtils.damp(
        spin.current.rotation.x,
        worldState.pointerY * 0.18,
        2.5,
        delta,
      );
      spin.current.rotation.z = 0.12;
    }
    if (orbit.current) orbit.current.rotation.y += delta * 0.22;

    arcUniforms.uTime.value = state.clock.elapsedTime;
    arcUniforms.uColor.value.set(palette.secondary);
    arcUniforms.uAlpha.value = palette.glow;
    atmosphereUniforms.uColor.value.set(palette.primary);
    atmosphereUniforms.uStrength.value = 1.15 * palette.glow;
  });

  return (
    <group ref={group} position={[2.5, 0, 0]}>
      <group ref={spin}>
        {/* Opaque core hides the far side so dots read as a solid world. */}
        <mesh>
          <sphereGeometry args={[RADIUS * 0.985, 48, 32]} />
          <meshBasicMaterial color={palette.globeCore} />
        </mesh>

        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[globe.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[globe.colors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={getDotTexture()}
            size={lite ? 0.15 : 0.11}
            vertexColors
            sizeAttenuation
            transparent
            depthWrite={false}
            blending={blending}
            opacity={palette.additive ? 0.95 : 1}
          />
        </points>

        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[arcs.positions, 3]} />
            <bufferAttribute attach="attributes-aT" args={[arcs.t, 1]} />
            <bufferAttribute attach="attributes-aSeed" args={[arcs.seed, 1]} />
          </bufferGeometry>
          <shaderMaterial
            ref={arcMaterial}
            uniforms={arcUniforms}
            vertexShader={ARC_VERTEX}
            fragmentShader={ARC_FRAGMENT}
            transparent
            depthWrite={false}
            blending={blending}
          />
        </lineSegments>
      </group>

      <mesh scale={1.09}>
        <sphereGeometry args={[RADIUS, 48, 32]} />
        <shaderMaterial
          uniforms={atmosphereUniforms}
          vertexShader={ATMOSPHERE_VERTEX}
          fragmentShader={ATMOSPHERE_FRAGMENT}
          transparent
          depthWrite={false}
          blending={blending}
        />
      </mesh>

      <group ref={orbit} rotation={[0.5, 0, 0.25]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RADIUS * 1.5, 0.008, 6, 180]} />
          <meshBasicMaterial color={palette.primary} transparent opacity={0.55} />
        </mesh>
        <mesh position={[RADIUS * 1.5, 0, 0]}>
          <octahedronGeometry args={[0.1, 0]} />
          <meshBasicMaterial color={palette.warm} />
        </mesh>
        <mesh position={[-RADIUS * 1.5, 0, 0]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshBasicMaterial color={palette.secondary} />
        </mesh>
      </group>

      <group rotation={[-0.9, 0.4, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RADIUS * 1.9, 0.005, 6, 200]} />
          <meshBasicMaterial color={palette.secondary} transparent opacity={0.3} />
        </mesh>
      </group>
    </group>
  );
}
