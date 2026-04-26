import type { DatabaseClient } from "@/server/db";
import { getDatabase, getProjectRecord } from "@/server/db";
import {
  createLocalStorageDriver,
  type StorageDriver
} from "@/server/storage";
import {
  getMotionClipRecord,
  updateMotionClipRecord
} from "@/server/motion";
import type { GenerationJob, JsonValue, PetProfile } from "@/types";
import { evaluateMotionClipQuality } from "./evaluator";

export interface QualityEvaluationJobPayload {
  clipId: string;
  petProfile: PetProfile;
}

export interface QualityEvaluationHandlerDeps {
  db?: DatabaseClient;
  storage?: StorageDriver;
}

export async function handleQualityEvaluationJob(
  job: GenerationJob,
  deps: QualityEvaluationHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const storage = deps.storage ?? createLocalStorageDriver();
  const payload = coercePayload(job.payload);
  const clip = getMotionClipRecord(payload.clipId, db);

  if (!clip) {
    throw new Error(`MotionClip ${payload.clipId} was not found.`);
  }
  assertSelectedPetClip(job.projectId, clip, payload.petProfile, db);

  const evaluation = await evaluateMotionClipQuality({
    clip,
    petProfile: payload.petProfile,
    storage
  });
  updateMotionClipRecord(
    clip.id,
    {
      qualityScore: evaluation.score,
      status: evaluation.passed ? "ready" : "failed"
    },
    db
  );

  return {
    clipId: clip.id,
    motionKey: clip.motionKey,
    qualityScore: evaluation.score,
    passed: evaluation.passed,
    issues: evaluation.issues,
    source: evaluation.source
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
    throw new Error("Quality payload does not match the selected pet clip.");
  }

  const project = getProjectRecord(projectId, db);
  if (!project?.selectedPetId) {
    throw new Error("Quality job requires a persisted selected pet.");
  }
  if (project.selectedPetId !== petProfile.id) {
    throw new Error("Quality payload pet is not the selected pet.");
  }
}

function coercePayload(payload: JsonValue): QualityEvaluationJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("quality-evaluation payload must be an object.");
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.clipId !== "string") {
    throw new Error("quality-evaluation payload requires clipId.");
  }

  if (!record.petProfile || typeof record.petProfile !== "object") {
    throw new Error("quality-evaluation payload requires petProfile.");
  }

  return {
    clipId: record.clipId,
    petProfile: record.petProfile as PetProfile
  };
}
