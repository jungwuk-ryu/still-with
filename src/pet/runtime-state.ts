import type { PetRuntimeState } from "@/types";
import {
  getPetMotionDefinition,
  isPetMotionKey,
  type PetMotionKey
} from "./motion-set";
import type { PetTransitionPlan } from "./transition-planner";

export interface EnqueueMotionPlanOptions {
  now?: Date;
  maxQueuedMotionKeys?: number;
  repeatWindowMs?: number;
}

export interface CompleteMotionOptions {
  now?: Date;
}

export function createInitialPetRuntimeState(
  projectId: string,
  now = new Date()
): PetRuntimeState {
  return {
    projectId,
    currentPose: "stand",
    targetPose: null,
    currentClipId: null,
    queuedMotionKeys: [],
    lastUserIntent: null,
    lastUpdatedAt: now.toISOString()
  };
}

export function enqueueMotionPlan(
  state: PetRuntimeState,
  plan: PetTransitionPlan,
  options: EnqueueMotionPlanOptions = {}
): PetRuntimeState {
  const now = options.now ?? new Date();
  const repeatWindowMs = options.repeatWindowMs ?? 1_500;
  const maxQueuedMotionKeys = options.maxQueuedMotionKeys ?? 8;
  const existingQueue = state.queuedMotionKeys.filter(isPetMotionKey);
  const planKeys = plan.motionKeys.filter(isPetMotionKey);
  const repeatedIntent =
    state.lastUserIntent === plan.requestedMotionKey &&
    now.getTime() - new Date(state.lastUpdatedAt).getTime() <= repeatWindowMs;

  if (repeatedIntent && queueAlreadyContainsPlan(existingQueue, planKeys)) {
    return {
      ...state,
      targetPose: plan.finalPose,
      lastUpdatedAt: now.toISOString()
    };
  }

  const queueWithoutTrailingIdle =
    existingQueue.at(-1) === "stand_idle" && planKeys[0] !== "stand_idle"
      ? existingQueue.slice(0, -1)
      : existingQueue;
  const queuedMotionKeys = compactQueue([
    ...queueWithoutTrailingIdle,
    ...planKeys
  ]).slice(-maxQueuedMotionKeys);

  return {
    ...state,
    targetPose: plan.finalPose,
    queuedMotionKeys,
    lastUserIntent: plan.requestedMotionKey,
    lastUpdatedAt: now.toISOString()
  };
}

export function completeQueuedMotion(
  state: PetRuntimeState,
  completedMotionKey: string,
  options: CompleteMotionOptions = {}
): PetRuntimeState {
  const motionDefinition = getPetMotionDefinition(completedMotionKey);
  const now = options.now ?? new Date();
  const queuedMotionKeys = removeFirstMatchingMotion(
    state.queuedMotionKeys,
    completedMotionKey
  );

  if (!motionDefinition) {
    return {
      ...state,
      queuedMotionKeys,
      lastUpdatedAt: now.toISOString()
    };
  }

  return {
    ...state,
    currentPose: motionDefinition.toState,
    targetPose: queuedMotionKeys.length > 0 ? state.targetPose : null,
    currentClipId: null,
    queuedMotionKeys,
    lastUpdatedAt: now.toISOString()
  };
}

function queueAlreadyContainsPlan(
  queue: readonly PetMotionKey[],
  planKeys: readonly PetMotionKey[]
): boolean {
  if (planKeys.length === 0) {
    return true;
  }

  const queueSignature = queue.join(">");
  const planSignature = planKeys.join(">");
  return queueSignature.endsWith(planSignature) || queueSignature.includes(planSignature);
}

function compactQueue(motionKeys: readonly PetMotionKey[]): PetMotionKey[] {
  const compacted: PetMotionKey[] = [];

  for (const key of motionKeys) {
    if (compacted.at(-1) !== key) {
      compacted.push(key);
    }
  }

  return compacted;
}

function removeFirstMatchingMotion(
  queuedMotionKeys: readonly string[],
  completedMotionKey: string
): string[] {
  const index = queuedMotionKeys.findIndex((key) => key === completedMotionKey);

  if (index === -1) {
    return queuedMotionKeys.slice(1);
  }

  return [
    ...queuedMotionKeys.slice(0, index),
    ...queuedMotionKeys.slice(index + 1)
  ];
}
