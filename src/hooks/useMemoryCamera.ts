"use client";

import { useMemo, useRef } from "react";
import type { PointerEvent, WheelEvent } from "react";
import type * as THREE from "three";
import type { CameraPose } from "@/types";

interface CameraControlState {
  yaw: number;
  pitch: number;
  depth: number;
}

interface MemoryCameraFocus {
  position: [number, number, number];
  height: number;
}

interface PointerState {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  start: CameraControlState;
  target: CameraControlState;
  current: CameraControlState;
  wheelReturnAt: number;
}

const LIMITS = {
  yaw: 0.24,
  pitch: 0.11,
  depth: 0.7
};

const ZERO_STATE: CameraControlState = {
  yaw: 0,
  pitch: 0,
  depth: 0
};

export function useMemoryCamera() {
  const pointerRef = useRef<PointerState>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    start: { ...ZERO_STATE },
    target: { ...ZERO_STATE },
    current: { ...ZERO_STATE },
    wheelReturnAt: 0
  });

  return useMemo(
    () => ({
      bind: {
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
          const state = pointerRef.current;
          state.active = true;
          state.pointerId = event.pointerId;
          state.startX = event.clientX;
          state.startY = event.clientY;
          state.start = { ...state.target };
          event.currentTarget.setPointerCapture(event.pointerId);
        },
        onPointerMove: (event: PointerEvent<HTMLElement>) => {
          const state = pointerRef.current;

          if (!state.active || state.pointerId !== event.pointerId) {
            return;
          }

          const width = Math.max(window.innerWidth, 1);
          const height = Math.max(window.innerHeight, 1);
          const deltaX = (event.clientX - state.startX) / width;
          const deltaY = (event.clientY - state.startY) / height;

          state.target.yaw = clamp(
            state.start.yaw + deltaX * 1.15,
            -LIMITS.yaw,
            LIMITS.yaw
          );
          state.target.pitch = clamp(
            state.start.pitch + deltaY * 0.48,
            -LIMITS.pitch,
            LIMITS.pitch
          );
          state.target.depth = clamp(
            state.start.depth + deltaY * 1.15,
            -LIMITS.depth,
            LIMITS.depth
          );
        },
        onPointerUp: (event: PointerEvent<HTMLElement>) => {
          releasePointer(pointerRef.current, event);
        },
        onPointerCancel: (event: PointerEvent<HTMLElement>) => {
          releasePointer(pointerRef.current, event);
        },
        onWheel: (event: WheelEvent<HTMLElement>) => {
          const state = pointerRef.current;
          state.target.depth = clamp(
            state.target.depth + event.deltaY * 0.0012,
            -LIMITS.depth,
            LIMITS.depth
          );
          state.wheelReturnAt = performance.now() + 240;
        }
      },
      updateCamera: (
        camera: THREE.PerspectiveCamera,
        lookAtTarget: THREE.Vector3,
        initialPose: CameraPose,
        focus: MemoryCameraFocus | null,
        deltaSeconds: number
      ) => {
        const state = pointerRef.current;

        if (!state.active && performance.now() > state.wheelReturnAt) {
          state.target.yaw = lerp(state.target.yaw, 0, 0.05);
          state.target.pitch = lerp(state.target.pitch, 0, 0.05);
          state.target.depth = lerp(state.target.depth, 0, 0.05);
        }

        const smoothing = 1 - Math.pow(0.0008, Math.max(deltaSeconds, 0.001));
        state.current.yaw = lerp(state.current.yaw, state.target.yaw, smoothing);
        state.current.pitch = lerp(
          state.current.pitch,
          state.target.pitch,
          smoothing
        );
        state.current.depth = lerp(
          state.current.depth,
          state.target.depth,
          smoothing
        );

        const petAwarePose = getPetAwarePose(initialPose, focus);
        const basePosition = petAwarePose.position;
        const baseTarget = petAwarePose.target;
        const radius = Math.max(
          1.2,
          distance(basePosition, baseTarget) + state.current.depth
        );
        const theta = Math.atan2(
          basePosition[0] - baseTarget[0],
          basePosition[2] - baseTarget[2]
        );
        const basePitch = Math.asin(
          (basePosition[1] - baseTarget[1]) / Math.max(radius, 0.001)
        );
        const yaw = theta + state.current.yaw;
        const pitch = clamp(basePitch + state.current.pitch, -0.35, 0.35);

        camera.position.set(
          baseTarget[0] + Math.sin(yaw) * Math.cos(pitch) * radius,
          baseTarget[1] + Math.sin(pitch) * radius,
          baseTarget[2] + Math.cos(yaw) * Math.cos(pitch) * radius
        );
        lookAtTarget.set(baseTarget[0], baseTarget[1], baseTarget[2]);
        camera.lookAt(lookAtTarget);
      }
    }),
    []
  );
}

function releasePointer(
  state: PointerState,
  event: PointerEvent<HTMLElement>
) {
  state.active = false;
  state.pointerId = null;

  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

function distance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function getPetAwarePose(
  initialPose: CameraPose,
  focus: MemoryCameraFocus | null
): CameraPose {
  if (!focus) {
    return initialPose;
  }

  const petFocus: [number, number, number] = [
    focus.position[0],
    focus.position[1] + focus.height * 0.38,
    focus.position[2]
  ];
  const targetBlend = 1;
  const cameraBlend = 0.08;

  return {
    position: blendVector(initialPose.position, petFocus, cameraBlend),
    target: blendVector(initialPose.target, petFocus, targetBlend),
    fov: initialPose.fov
  };
}

function blendVector(
  from: [number, number, number],
  to: [number, number, number],
  amount: number
): [number, number, number] {
  return [
    lerp(from[0], to[0], amount),
    lerp(from[1], to[1], amount),
    lerp(from[2], to[2], amount)
  ];
}
