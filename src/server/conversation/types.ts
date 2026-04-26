import type {
  CameraPose,
  MotionClip,
  PetProfile,
  PetRuntimeState,
  WorldAsset
} from "@/types";
import type { PetMotionKey } from "@/pet/motion-set";

export type WorldAssetTier = "100k" | "500k" | "full-res" | "pano" | "stub";

export interface PetBillboardPlacement {
  position: [number, number, number];
  width: number;
  height: number;
}

export interface ExperienceWorldManifest {
  sceneClusterId: string | null;
  label: string | null;
  asset: WorldAsset | null;
  tierHint: WorldAssetTier;
  spzUrl: string | null;
  panoUrl: string | null;
  thumbnailUrl: string | null;
  groundPlaneOffset: number;
  initialCameraPose: CameraPose;
  source: "database" | "demo-stub";
}

export type ExperienceSpaceStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed";

export interface ExperienceSpaceSummary {
  sceneClusterId: string;
  label: string;
  status: ExperienceSpaceStatus;
  progress: number;
  thumbnailUrl: string | null;
  active: boolean;
  canEnter: boolean;
}

export interface ExperiencePetManifest {
  profile: PetProfile | null;
  motionClips: MotionClip[];
  runtimeState: PetRuntimeState;
  idleVideoUrl: string | null;
  posterUrl: string | null;
  chromaKeyColor: "green" | "blue";
  placement: PetBillboardPlacement;
}

export interface ExperienceAudioManifest {
  backgroundMusicUrl: string | null;
  petSoundEffects: Partial<Record<MotionIntentKey, string>>;
}

export interface ExperienceManifest {
  projectId: string;
  displayName: string | null;
  world: ExperienceWorldManifest;
  spaces: ExperienceSpaceSummary[];
  pet: ExperiencePetManifest;
  audio: ExperienceAudioManifest;
  chatAccessToken: string | null;
  realtimeAccessToken: string | null;
  generatedAt: string;
}

export type MotionIntentKey =
  | "idle"
  | "look_at_me"
  | "turn_around"
  | "sit"
  | "come_closer";

export interface PlannedMotion {
  sequenceId: string;
  key: MotionIntentKey;
  motionKey: PetMotionKey;
  clipId: string | null;
  videoUrl: string | null;
  fromState: string;
  toState: string;
  durationMs: number;
  loopable: boolean;
}

export interface ConversationTurnResult {
  message: string;
  assistantMessage: string;
  motion: PlannedMotion;
  motionQueue: PlannedMotion[];
  petState: PetRuntimeState;
  model: string | null;
}

export interface ConversationTurnResponse extends ConversationTurnResult {
  nextChatAccessToken: string | null;
}
