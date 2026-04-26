import type { MotionClip, MotionClipPostprocess } from "@/types";
import {
  PET_MOTION_DEFINITIONS,
  REQUIRED_MOTION_KEYS,
  type PetMotionKey
} from "@/pet/motion-set";

export interface MotionClipManifestEntry {
  id: string;
  motionKey: PetMotionKey;
  fromState: string;
  toState: string;
  durationMs: number;
  loopable: boolean;
  keyframeImageUrls: string[];
  rawVideoUrl: string | null;
  processedVideoUrl: string | null;
  alphaVideoUrl: string | null;
  alphaMode: "alpha-video" | "shader-chroma-key" | "fallback-still";
  chromaKeyColor: "green" | "blue" | null;
  shaderUniforms: MotionClipPostprocess["shaderUniforms"] | null;
  providerOperationId: string | null;
  providerStatus: string | null;
  providerErrorMessage: string | null;
  qualityScore: number | null;
  status: MotionClip["status"];
}

export interface MotionClipManifest {
  version: 1;
  projectId: string;
  petProfileId: string;
  requiredMotionKeys: readonly PetMotionKey[];
  standHubPose: "stand";
  transitionPlannerContract: {
    standIsHub: true;
    sitToTurnAround: readonly ["sit_to_stand", "turn_360", "stand_idle"];
    rapidRepeatPolicy: "dedupe-within-1500ms-and-cap-queue";
  };
  clips: Partial<Record<PetMotionKey, MotionClipManifestEntry>>;
}

export function buildMotionClipManifest(
  projectId: string,
  petProfileId: string,
  clips: readonly MotionClip[]
): MotionClipManifest {
  const manifestEntries: Partial<Record<PetMotionKey, MotionClipManifestEntry>> =
    {};

  for (const clip of clips) {
    if (!isManifestMotionKey(clip.motionKey)) {
      continue;
    }

    const definition = PET_MOTION_DEFINITIONS[clip.motionKey];
    manifestEntries[clip.motionKey] = {
      id: clip.id,
      motionKey: clip.motionKey,
      fromState: clip.fromState,
      toState: clip.toState,
      durationMs: clip.durationMs ?? definition.durationMs,
      loopable: clip.loopable,
      keyframeImageUrls: clip.keyframeImageUrls,
      rawVideoUrl: clip.rawVideoUrl,
      processedVideoUrl: clip.processedVideoUrl,
      alphaVideoUrl: clip.alphaVideoUrl,
      alphaMode: inferAlphaMode(clip),
      chromaKeyColor: clip.postprocess?.chromaKeyColor ?? null,
      shaderUniforms: clip.postprocess?.shaderUniforms ?? null,
      providerOperationId: clip.providerOperationId,
      providerStatus: clip.providerStatus,
      providerErrorMessage: clip.providerErrorMessage,
      qualityScore: clip.qualityScore,
      status: clip.status
    };
  }

  return {
    version: 1,
    projectId,
    petProfileId,
    requiredMotionKeys: REQUIRED_MOTION_KEYS,
    standHubPose: "stand",
    transitionPlannerContract: {
      standIsHub: true,
      sitToTurnAround: ["sit_to_stand", "turn_360", "stand_idle"],
      rapidRepeatPolicy: "dedupe-within-1500ms-and-cap-queue"
    },
    clips: manifestEntries
  };
}

function inferAlphaMode(
  clip: MotionClip
): MotionClipManifestEntry["alphaMode"] {
  if (clip.alphaVideoUrl) {
    return "alpha-video";
  }

  if (clip.rawVideoUrl || clip.processedVideoUrl?.endsWith(".mp4")) {
    return "shader-chroma-key";
  }

  return "fallback-still";
}

function isManifestMotionKey(value: string): value is PetMotionKey {
  return REQUIRED_MOTION_KEYS.includes(value as PetMotionKey);
}
