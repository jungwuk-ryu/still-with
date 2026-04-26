export const PET_POSES = ["stand", "sit"] as const;

export type PetPose = (typeof PET_POSES)[number];

export const REQUIRED_MOTION_KEYS = [
  "stand_idle",
  "sit",
  "sit_to_stand",
  "stand_to_sit",
  "turn_360",
  "look_at_camera",
  "walk_small"
] as const;

export type PetMotionKey = (typeof REQUIRED_MOTION_KEYS)[number];

export type PetMotionCategory = "idle" | "transition" | "action";

export interface PetMotionDefinition {
  key: PetMotionKey;
  fromState: PetPose;
  toState: PetPose;
  category: PetMotionCategory;
  durationMs: number;
  loopable: boolean;
  description: string;
  aliases: readonly string[];
}

export const PET_MOTION_DEFINITIONS: Record<
  PetMotionKey,
  PetMotionDefinition
> = {
  stand_idle: {
    key: "stand_idle",
    fromState: "stand",
    toState: "stand",
    category: "idle",
    durationMs: 4_000,
    loopable: true,
    description:
      "A seamless standing idle loop: the pet stays in place with natural breathing, tiny weight shifts, and matching first and final frames.",
    aliases: ["idle", "stay", "wait", "stand", "stand still", "calm"]
  },
  sit: {
    key: "sit",
    fromState: "sit",
    toState: "sit",
    category: "idle",
    durationMs: 4_000,
    loopable: true,
    description:
      "A seamless seated idle loop: the pet remains seated with subtle breathing, a soft attentive posture, and matching first and final frames.",
    aliases: ["sit idle", "stay seated", "sitting", "remain sitting"]
  },
  sit_to_stand: {
    key: "sit_to_stand",
    fromState: "sit",
    toState: "stand",
    category: "transition",
    durationMs: 2_400,
    loopable: false,
    description:
      "The pet rises naturally from a seated pose into a stable standing pose.",
    aliases: ["stand up", "get up", "rise"]
  },
  stand_to_sit: {
    key: "stand_to_sit",
    fromState: "stand",
    toState: "sit",
    category: "transition",
    durationMs: 2_400,
    loopable: false,
    description:
      "The pet lowers naturally from standing into a comfortable seated pose.",
    aliases: ["sit down", "sit", "take a seat"]
  },
  turn_360: {
    key: "turn_360",
    fromState: "stand",
    toState: "stand",
    category: "action",
    durationMs: 8_000,
    loopable: false,
    description:
      "The pet makes one gentle full turn in place and ends facing the camera.",
    aliases: ["turn", "turn around", "spin", "circle", "rotate"]
  },
  look_at_camera: {
    key: "look_at_camera",
    fromState: "stand",
    toState: "stand",
    category: "action",
    durationMs: 3_000,
    loopable: false,
    description:
      "The pet gently lifts or turns its head to look toward the camera.",
    aliases: ["look", "look at me", "look here", "look at camera", "watch me"]
  },
  walk_small: {
    key: "walk_small",
    fromState: "stand",
    toState: "stand",
    category: "action",
    durationMs: 8_000,
    loopable: false,
    description:
      "The pet takes one or two small soft steps forward and settles back into standing.",
    aliases: ["walk", "come here", "come closer", "step forward", "move closer"]
  }
};

export function isPetPose(value: string | null | undefined): value is PetPose {
  return PET_POSES.includes(value as PetPose);
}

export function normalizePetPose(value: string | null | undefined): PetPose {
  return isPetPose(value) ? value : "stand";
}

export function isPetMotionKey(
  value: string | null | undefined
): value is PetMotionKey {
  return REQUIRED_MOTION_KEYS.includes(value as PetMotionKey);
}

export function getPetMotionDefinition(
  key: string | null | undefined
): PetMotionDefinition | null {
  return isPetMotionKey(key) ? PET_MOTION_DEFINITIONS[key] : null;
}

export function uniquePetMotionKeys(
  motionKeys: readonly string[] | undefined
): PetMotionKey[] {
  const seen = new Set<PetMotionKey>();
  const result: PetMotionKey[] = [];

  for (const key of motionKeys ?? []) {
    if (isPetMotionKey(key) && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }

  return result;
}
