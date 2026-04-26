import type { MotionClip, PetRuntimeState } from "@/types";
import {
  PET_MOTION_DEFINITIONS,
  normalizePetPose,
  type PetMotionKey,
  type PetPose
} from "@/pet/motion-set";
import type { MotionIntentKey, PlannedMotion } from "./types";

const MOTION_PATTERNS: Array<[MotionIntentKey, RegExp]> = [
  ["come_closer", /\b(come closer|come here|closer|near me|move closer|come over)\b/i],
  ["turn_around", /\b(turn around|spin|turn|look back)\b/i],
  ["sit", /\b(sit|sit down|settle|rest)\b/i],
  ["look_at_me", /\b(look at me|look here|watch me|face me|eyes)\b/i]
];

const RESPONSE_BY_INTENT: Record<MotionIntentKey, string> = {
  idle: "I'm here with you in this memory.",
  look_at_me: "Let's stay here together for a moment.",
  turn_around: "That little movement can hold so much of what you remember.",
  sit: "We can let this moment become quiet and still.",
  come_closer: "I'll keep this memory close with you."
};

export function inferMotionIntent(message: string): MotionIntentKey {
  const normalized = message.trim();

  if (!normalized) {
    return "idle";
  }

  return (
    MOTION_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ??
    "look_at_me"
  );
}

export function fallbackAssistantMessage(intent: MotionIntentKey): string {
  return RESPONSE_BY_INTENT[intent];
}

export function planMotionFromClips(
  intent: MotionIntentKey,
  clips: MotionClip[],
  runtimeState: PetRuntimeState
): PlannedMotion {
  const motionKeys = getMotionKeysForIntent(
    intent,
    normalizePetPose(runtimeState.currentPose)
  );
  const selectedClip =
    motionKeys
      .map((motionKey) =>
        clips.find(
          (clip) => clip.status === "ready" && clip.motionKey === motionKey
        )
      )
      .find(Boolean) ??
    clips.find(
      (clip) => clip.status === "ready" && clip.motionKey === "stand_idle"
    ) ??
    null;
  const fallbackDefinition = PET_MOTION_DEFINITIONS[motionKeys[0] ?? "stand_idle"];
  const toState = normalizePetPose(selectedClip?.toState ?? fallbackDefinition.toState);

  return {
    sequenceId: globalThis.crypto.randomUUID(),
    key: intent,
    clipId: selectedClip?.id ?? null,
    videoUrl:
      selectedClip?.processedVideoUrl ??
      selectedClip?.alphaVideoUrl ??
      selectedClip?.rawVideoUrl ??
      null,
    fromState: normalizePetPose(selectedClip?.fromState ?? runtimeState.currentPose),
    toState,
    durationMs: selectedClip?.durationMs ?? fallbackDefinition.durationMs,
    loopable: selectedClip?.loopable ?? fallbackDefinition.loopable
  };
}

export function applyPlannedMotion(
  runtimeState: PetRuntimeState,
  motion: PlannedMotion,
  userIntent: string
): PetRuntimeState {
  return {
    projectId: runtimeState.projectId,
    currentPose: normalizePetPose(motion.toState),
    targetPose: null,
    currentClipId: motion.clipId,
    queuedMotionKeys: [],
    lastUserIntent: userIntent,
    lastUpdatedAt: new Date().toISOString()
  };
}

function getMotionKeysForIntent(
  intent: MotionIntentKey,
  currentPose: PetPose
): PetMotionKey[] {
  switch (intent) {
    case "come_closer":
      return ["walk_small", "stand_idle"];
    case "turn_around":
      return ["turn_360", "stand_idle"];
    case "sit":
      return currentPose === "sit" ? ["sit"] : ["stand_to_sit", "sit"];
    case "look_at_me":
      return ["look_at_camera", "stand_idle"];
    case "idle":
    default:
      return ["stand_idle"];
  }
}
