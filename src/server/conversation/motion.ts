import type { MotionClip, PetRuntimeState } from "@/types";
import {
  PET_MOTION_DEFINITIONS,
  normalizePetPose,
  type PetMotionKey,
  type PetPose
} from "@/pet/motion-set";
import {
  planPetTransition,
  type PetTransitionPlan
} from "@/pet/transition-planner";
import type { MotionIntentKey, PlannedMotion } from "./types";

const RESPONSE_BY_INTENT: Record<MotionIntentKey, string> = {
  idle: "A quiet idle movement plays.",
  look_at_me: "Your pet turns gently toward you.",
  turn_around: "Your pet turns softly in place.",
  sit: "Your pet settles into a calm sit.",
  come_closer: "Your pet takes a small step closer."
};

export function fallbackAssistantMessage(intent: MotionIntentKey): string {
  return RESPONSE_BY_INTENT[intent];
}

export function planMotionFromClips(
  intent: MotionIntentKey,
  clips: MotionClip[],
  runtimeState: PetRuntimeState
): PlannedMotion {
  return planMotionSequenceFromClips(intent, clips, runtimeState)[0];
}

export function planMotionSequenceFromClips(
  intent: MotionIntentKey,
  clips: MotionClip[],
  runtimeState: PetRuntimeState,
  userCommand?: string
): PlannedMotion[] {
  return planMotionQueueFromClips(
    intent,
    clips,
    runtimeState,
    userCommand
  ).motionQueue;
}

export function planMotionQueueFromClips(
  intent: MotionIntentKey,
  clips: readonly MotionClip[],
  runtimeState: PetRuntimeState,
  userCommand?: string | null
): { plan: PetTransitionPlan; motionQueue: PlannedMotion[] } {
  const plan = planPetTransition({
    currentPose: runtimeState.currentPose,
    requestedMotionKey: getRequestedMotionKeyForIntent(intent),
    userCommand,
    includeRestingIdle: true
  });
  const sequenceIdPrefix = globalThis.crypto.randomUUID();
  let sequencePose = plan.fromPose;

  const motionQueue = plan.motionKeys.map((motionKey, index) => {
    const motion = buildPlannedMotion({
      intent,
      motionKey,
      clips,
      sequenceId: `${sequenceIdPrefix}-${index + 1}`,
      fallbackFromState: sequencePose
    });

    sequencePose = normalizePetPose(motion.toState);
    return motion;
  });

  return { plan, motionQueue };
}

export function applyPlannedMotion(
  runtimeState: PetRuntimeState,
  motion: PlannedMotion,
  userIntent: string
): PetRuntimeState {
  return applyPlannedMotionSequence(runtimeState, [motion], userIntent, {
    requestedMotionKey: motion.motionKey,
    fromPose: normalizePetPose(runtimeState.currentPose),
    finalPose: normalizePetPose(motion.toState),
    motionKeys: [motion.motionKey],
    usesStandHub: false,
    reason: "Single motion compatibility state update."
  });
}

export function applyPlannedMotionSequence(
  runtimeState: PetRuntimeState,
  motions: readonly PlannedMotion[],
  userIntent: string,
  plan: PetTransitionPlan
): PetRuntimeState {
  const firstMotion = motions[0];
  const finalMotion = motions.at(-1);
  const finalPose = normalizePetPose(finalMotion?.toState ?? plan.finalPose);

  return {
    ...runtimeState,
    currentPose: finalPose,
    targetPose: null,
    currentClipId: finalMotion?.clipId ?? firstMotion?.clipId ?? null,
    queuedMotionKeys: [],
    lastUserIntent: userIntent,
    lastUpdatedAt: new Date().toISOString()
  };
}

function getRequestedMotionKeyForIntent(intent: MotionIntentKey): PetMotionKey {
  switch (intent) {
    case "come_closer":
      return "walk_small";
    case "turn_around":
      return "turn_360";
    case "sit":
      return "stand_to_sit";
    case "look_at_me":
      return "look_at_camera";
    case "idle":
    default:
      return "stand_idle";
  }
}

function buildPlannedMotion({
  intent,
  motionKey,
  clips,
  sequenceId,
  fallbackFromState
}: {
  intent: MotionIntentKey;
  motionKey: PetMotionKey;
  clips: readonly MotionClip[];
  sequenceId: string;
  fallbackFromState: PetPose;
}): PlannedMotion {
  const selectedClip = clips.find(
    (clip) => clip.status === "ready" && clip.motionKey === motionKey
  );
  const definition = PET_MOTION_DEFINITIONS[motionKey];
  const fromState = normalizePetPose(
    selectedClip?.fromState ?? definition.fromState ?? fallbackFromState
  );
  const toState = normalizePetPose(selectedClip?.toState ?? definition.toState);

  return {
    sequenceId,
    key: intent,
    motionKey,
    clipId: selectedClip?.id ?? null,
    videoUrl:
      selectedClip?.processedVideoUrl ??
      selectedClip?.alphaVideoUrl ??
      selectedClip?.rawVideoUrl ??
      null,
    fromState,
    toState,
    durationMs: selectedClip?.durationMs ?? definition.durationMs,
    loopable: selectedClip?.loopable ?? definition.loopable
  };
}
