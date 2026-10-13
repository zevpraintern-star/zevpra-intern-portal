"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { getPathCurve } from "./path";
import { worldState } from "./world-state";

const ORIGIN_LOOK = new THREE.Vector3(0, 0.1, 0);

function easeOutExpo(x: number): number {
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/**
 * Drives the camera along the flight path.
 *
 * - Position follows page scroll through a damped value, so wheel ticks glide.
 * - FOV widens with speed for a subtle warp feel and settles when scrolling stops.
 * - The pointer adds a small parallax offset and a hint of roll.
 * - On first load the camera dollies in from far away (the intro shot).
 */
export function CameraRig({ introStart }: { introStart: number }) {
  const curve = useMemo(() => getPathCurve(), []);
  const state = useMemo(
    () => ({
      t: 0,
      fov: 55,
      px: 0,
      py: 0,
      position: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      look: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ camera, clock, size }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.05);
    const previousT = state.t;

    state.t = THREE.MathUtils.damp(state.t, worldState.target, 3.4, dt);
    state.px = THREE.MathUtils.damp(state.px, worldState.pointerX, 2.6, dt);
    state.py = THREE.MathUtils.damp(state.py, worldState.pointerY, 2.6, dt);

    const speed = Math.abs(state.t - previousT) / Math.max(dt, 1e-4);

    curve.getPointAt(state.t, state.position);
    curve.getPointAt(Math.min(1, state.t + 0.02), state.ahead);
    if (state.t > 0.985) {
      state.ahead.copy(state.position).addScaledVector(curve.getTangentAt(1), 12);
    }

    // Start by looking at the globe, then swing round to look down the path.
    const swing = THREE.MathUtils.smoothstep(state.t, 0.015, 0.12);
    state.look.copy(ORIGIN_LOOK).lerp(state.ahead, swing);

    // Intro dolly.
    const elapsed = clock.elapsedTime - introStart;
    const intro = easeOutExpo(THREE.MathUtils.clamp(elapsed / 3.4, 0, 1));
    const back = 1 - intro;
    cam.position.set(
      state.position.x,
      state.position.y + back * 2.2,
      state.position.z + back * 20,
    );

    cam.lookAt(state.look);

    // Pointer parallax in camera space.
    state.right.setFromMatrixColumn(cam.matrixWorld, 0);
    state.up.setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(state.right, state.px * 0.55);
    cam.position.addScaledVector(state.up, state.py * 0.32);
    cam.lookAt(state.look);
    cam.rotateZ(-state.px * 0.035);

    const narrow = size.width / size.height < 0.9;
    const baseFov = narrow ? 68 : 55;
    const warp = Math.min(speed * 55, 16);
    cam.fov = THREE.MathUtils.damp(cam.fov, baseFov + warp + back * 10, 5, dt);
    cam.updateProjectionMatrix();
  });

  return null;
}
