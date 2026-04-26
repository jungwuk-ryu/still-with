import type { MotionClip, PetRuntimeState } from "@/types";
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
  const exactClip = clips.find(
    (clip) => clip.status === "ready" && clip.motionKey === intent
  );
  const stateClip = clips.find(
    (clip) =>
      clip.status === "ready" &&
      (clip.toState === intent || clip.toState === intent.replaceAll("_", "-"))
  );
  const idleClip = clips.find(
    (clip) => clip.status === "ready" && clip.motionKey === "idle"
  );
  const selectedClip = exactClip ?? stateClip ?? idleClip ?? null;
  const toState = selectedClip?.toState ?? motionIntentToPose(intent);

  return {
    sequenceId: globalThis.crypto.randomUUID(),
    key: intent,
    clipId: selectedClip?.id ?? null,
    videoUrl:
      selectedClip?.processedVideoUrl ??
      selectedClip?.alphaVideoUrl ??
      selectedClip?.rawVideoUrl ??
      null,
    fromState: selectedClip?.fromState ?? runtimeState.currentPose,
    toState,
    durationMs: selectedClip?.durationMs ?? 2400,
    loopable: selectedClip?.loopable ?? intent === "idle"
  };
}

export function applyPlannedMotion(
  runtimeState: PetRuntimeState,
  motion: PlannedMotion,
  userIntent: string
): PetRuntimeState {
  return {
    projectId: runtimeState.projectId,
    currentPose: motion.toState,
    targetPose: null,
    currentClipId: motion.clipId,
    queuedMotionKeys: [],
    lastUserIntent: userIntent,
    lastUpdatedAt: new Date().toISOString()
  };
}

function motionIntentToPose(intent: MotionIntentKey): string {
  switch (intent) {
    case "come_closer":
      return "closer";
    case "turn_around":
      return "turn";
    case "sit":
      return "sit";
    case "look_at_me":
      return "attentive";
    case "idle":
    default:
      return "stand";
  }
}
