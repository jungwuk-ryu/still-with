import {
  getPetMotionDefinition,
  isPetMotionKey,
  normalizePetPose,
  PET_MOTION_DEFINITIONS,
  type PetMotionKey,
  type PetPose
} from "./motion-set";

export interface PlanPetTransitionInput {
  currentPose: string | null | undefined;
  requestedMotionKey?: string | null;
  userCommand?: string | null;
  includeRestingIdle?: boolean;
}

export interface PetTransitionPlan {
  requestedMotionKey: PetMotionKey;
  fromPose: PetPose;
  finalPose: PetPose;
  motionKeys: PetMotionKey[];
  usesStandHub: boolean;
  reason: string;
}

export function inferMotionKeyFromCommand(
  command: string | null | undefined
): PetMotionKey | null {
  const normalized = normalizeCommand(command);

  if (!normalized) {
    return null;
  }

  if (/\b(sit down|please sit|can you sit|sit)\b/.test(normalized)) {
    return "stand_to_sit";
  }

  if (/\b(stand up|get up|rise|stand)\b/.test(normalized)) {
    return "stand_idle";
  }

  if (/\b(turn around|turn|spin|circle|rotate)\b/.test(normalized)) {
    return "turn_360";
  }

  if (/\b(look at me|look here|look at camera|look|watch me)\b/.test(normalized)) {
    return "look_at_camera";
  }

  if (/\b(come closer|come here|walk|step forward|move closer|closer)\b/.test(normalized)) {
    return "walk_small";
  }

  if (/\b(idle|stay|wait|calm|rest)\b/.test(normalized)) {
    return "stand_idle";
  }

  return null;
}

export function planPetTransition(
  input: PlanPetTransitionInput
): PetTransitionPlan {
  const fromPose = normalizePetPose(input.currentPose);
  const requestedMotionKey =
    normalizeRequestedMotionKey(input.requestedMotionKey) ??
    inferMotionKeyFromCommand(input.userCommand) ??
    "stand_idle";
  const includeRestingIdle = input.includeRestingIdle ?? true;

  if (requestedMotionKey === "sit" || requestedMotionKey === "stand_to_sit") {
    const motionKeys: PetMotionKey[] =
      fromPose === "sit" ? ["sit"] : ["stand_to_sit", "sit"];

    return {
      requestedMotionKey,
      fromPose,
      finalPose: "sit",
      motionKeys: collapseAdjacentDuplicates(motionKeys),
      usesStandHub: motionKeys.includes("stand_to_sit"),
      reason:
        fromPose === "sit"
          ? "Pet is already seated, so the seated idle clip is enough."
          : "Sitting is entered from the stand hub with the stand_to_sit transition."
    };
  }

  if (requestedMotionKey === "sit_to_stand") {
    const motionKeys: PetMotionKey[] =
      fromPose === "sit" ? ["sit_to_stand", "stand_idle"] : ["stand_idle"];

    return {
      requestedMotionKey,
      fromPose,
      finalPose: "stand",
      motionKeys: collapseAdjacentDuplicates(motionKeys),
      usesStandHub: fromPose === "sit",
      reason:
        fromPose === "sit"
          ? "Pet leaves sitting through sit_to_stand and settles in stand_idle."
          : "Pet is already at the stand hub."
    };
  }

  const motionDefinition = PET_MOTION_DEFINITIONS[requestedMotionKey];
  const motionKeys: PetMotionKey[] = [];
  let usesStandHub = false;

  if (motionDefinition.fromState === "stand" && fromPose !== "stand") {
    motionKeys.push("sit_to_stand");
    usesStandHub = true;
  }

  motionKeys.push(requestedMotionKey);

  if (
    includeRestingIdle &&
    motionDefinition.toState === "stand" &&
    requestedMotionKey !== "stand_idle"
  ) {
    motionKeys.push("stand_idle");
  }

  return {
    requestedMotionKey,
    fromPose,
    finalPose: motionDefinition.toState,
    motionKeys: collapseAdjacentDuplicates(motionKeys),
    usesStandHub,
    reason:
      usesStandHub || motionDefinition.fromState === "stand"
        ? "The requested motion is planned through the stand hub."
        : "The requested motion can play directly from the current pose."
  };
}

function normalizeRequestedMotionKey(
  requestedMotionKey: string | null | undefined
): PetMotionKey | null {
  if (isPetMotionKey(requestedMotionKey)) {
    return requestedMotionKey;
  }

  const normalized = normalizeCommand(requestedMotionKey);
  if (!normalized) {
    return null;
  }

  if (isPetMotionKey(normalized)) {
    return normalized;
  }

  for (const definition of Object.values(PET_MOTION_DEFINITIONS)) {
    if (
      definition.aliases.some((alias) => normalizeCommand(alias) === normalized)
    ) {
      return definition.key;
    }
  }

  return null;
}

function normalizeCommand(command: string | null | undefined): string {
  return command?.toLowerCase().replace(/[_-]+/g, " ").trim() ?? "";
}

function collapseAdjacentDuplicates(
  motionKeys: readonly PetMotionKey[]
): PetMotionKey[] {
  const result: PetMotionKey[] = [];

  for (const key of motionKeys) {
    if (result.at(-1) !== key && getPetMotionDefinition(key)) {
      result.push(key);
    }
  }

  return result;
}
