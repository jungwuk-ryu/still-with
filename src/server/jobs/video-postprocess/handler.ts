import type { DatabaseClient } from "@/server/db";
import { getDatabase, getProjectRecord } from "@/server/db";
import {
  getMotionClipRecord,
  updateMotionClipRecord
} from "@/server/motion";
import type { GenerationJob, JsonValue, PetProfile } from "@/types";
import { processChromaAlpha } from "./chroma";

export interface VideoPostprocessJobPayload {
  clipId: string;
  petProfile: PetProfile;
}

export interface VideoPostprocessHandlerDeps {
  db?: DatabaseClient;
}

export async function handleVideoPostprocessJob(
  job: GenerationJob,
  deps: VideoPostprocessHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const payload = coercePayload(job.payload);
  const clip = getMotionClipRecord(payload.clipId, db);

  if (!clip) {
    throw new Error(`MotionClip ${payload.clipId} was not found.`);
  }
  assertSelectedPetClip(job.projectId, clip, payload.petProfile, db);

  if (!clip.rawVideoUrl && clip.processedVideoUrl && clip.postprocess) {
    return {
      clipId: clip.id,
      motionKey: clip.motionKey,
      status: clip.status,
      chromaKeyColor: clip.postprocess.chromaKeyColor,
      alphaStrategy: clip.postprocess.alphaStrategy,
      shaderUniforms: clip.postprocess.shaderUniforms,
      preservedExistingFallback: true
    };
  }

  const result = processChromaAlpha({
    rawVideoUrl: clip.rawVideoUrl,
    keyframeImageUrls: clip.keyframeImageUrls,
    petProfile: payload.petProfile
  });
  const updated = updateMotionClipRecord(
    clip.id,
    {
      processedVideoUrl: result.processedVideoUrl,
      alphaVideoUrl: result.alphaVideoUrl,
      postprocess: {
        chromaKeyColor: result.chromaKeyColor,
        alphaStrategy: result.strategy,
        shaderUniforms: result.shaderUniforms
      },
      status: "ready"
    },
    db
  );

  return {
    clipId: clip.id,
    motionKey: clip.motionKey,
    status: updated?.status ?? "failed",
    chromaKeyColor: result.chromaKeyColor,
    alphaStrategy: result.strategy,
    shaderUniforms: result.shaderUniforms
  };
}

function assertSelectedPetClip(
  projectId: string,
  clip: { projectId: string; petProfileId: string },
  petProfile: PetProfile,
  db: DatabaseClient
): void {
  if (clip.projectId !== projectId) {
    throw new Error("MotionClip belongs to another project.");
  }
  if (clip.petProfileId !== petProfile.id || petProfile.projectId !== projectId) {
    throw new Error("Postprocess payload does not match the selected pet clip.");
  }

  const project = getProjectRecord(projectId, db);
  if (!project?.selectedPetId) {
    throw new Error("Postprocess job requires a persisted selected pet.");
  }
  if (project.selectedPetId !== petProfile.id) {
    throw new Error("Postprocess payload pet is not the selected pet.");
  }
}

function coercePayload(payload: JsonValue): VideoPostprocessJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("video-postprocess payload must be an object.");
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.clipId !== "string") {
    throw new Error("video-postprocess payload requires clipId.");
  }

  if (!record.petProfile || typeof record.petProfile !== "object") {
    throw new Error("video-postprocess payload requires petProfile.");
  }

  return {
    clipId: record.clipId,
    petProfile: record.petProfile as PetProfile
  };
}
