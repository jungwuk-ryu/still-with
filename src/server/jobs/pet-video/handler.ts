import type { DatabaseClient } from "@/server/db";
import { getDatabase, getProjectRecord } from "@/server/db";
import { createSoraProvider, type SoraProvider } from "@/server/providers";
import {
  createLocalStorageDriver,
  resolveProviderImageUrls,
  type StorageDriver
} from "@/server/storage";
import {
  PET_MOTION_DEFINITIONS,
  REQUIRED_MOTION_KEYS,
  uniquePetMotionKeys,
  type PetMotionKey
} from "@/pet/motion-set";
import { buildSoraMotionPrompt, chooseChromaKeyColor } from "@/ai/pet";
import {
  findMotionClipRecord,
  updateMotionClipRecord,
  upsertMotionClipRecord
} from "@/server/motion";
import type { GenerationJob, JsonValue, MotionClip, PetProfile } from "@/types";
import { processChromaAlpha } from "@/server/jobs/video-postprocess/chroma";
import { evaluateMotionClipQuality } from "@/server/jobs/quality-evaluation/evaluator";
import { getPetProfileRecord } from "@/server/jobs/pet-analysis/pet-profile-repository";
import { createFallbackStillAnimationAsset } from "./fallback";

export interface PetVideoJobPayload {
  petProfile: PetProfile;
  motionKeys?: string[];
  keyframeImageUrlsByMotion?: Record<string, string[]>;
  forceFallback?: boolean;
}

export interface PetVideoHandlerDeps {
  db?: DatabaseClient;
  storage?: StorageDriver;
  soraProvider?: SoraProvider;
  pollAttempts?: number;
  pollIntervalMs?: number;
}

export async function handlePetVideoJob(
  job: GenerationJob,
  deps: PetVideoHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const storage = deps.storage ?? createLocalStorageDriver();
  const soraProvider = deps.soraProvider ?? createSoraProvider();
  const payload = coercePayload(job.payload);
  const petProfile = resolveJobPetProfile(job.projectId, payload.petProfile, db);
  const motionKeys = normalizeMotionKeys(payload.motionKeys);
  const generatedClips: MotionClip[] = [];
  const failures: Array<{ motionKey: PetMotionKey; reason: string }> = [];
  let soraAttempted = false;
  let soraCompletedCount = 0;

  for (const motionKey of motionKeys) {
    const result = await generateMotionClip({
      db,
      storage,
      soraProvider,
      projectId: job.projectId,
      petProfile,
      motionKey,
      keyframeImageUrls:
        findMotionClipRecord(
          job.projectId,
          petProfile.id,
          motionKey,
          db
        )?.keyframeImageUrls ?? [],
      forceFallback: payload.forceFallback ?? false,
      pollAttempts: deps.pollAttempts ?? 10,
      pollIntervalMs: deps.pollIntervalMs ?? 3_000
    });

    soraAttempted ||= result.soraAttempted;
    if (result.soraCompleted) {
      soraCompletedCount += 1;
    }
    if (result.fallbackReason) {
      failures.push({ motionKey, reason: result.fallbackReason });
    }
    generatedClips.push(result.clip);
  }

  return {
    clips: generatedClips.map((clip) => ({
      id: clip.id,
      motionKey: clip.motionKey,
      status: clip.status,
      rawVideoUrl: clip.rawVideoUrl,
      processedVideoUrl: clip.processedVideoUrl,
      alphaVideoUrl: clip.alphaVideoUrl,
      providerOperationId: clip.providerOperationId,
      providerStatus: clip.providerStatus,
      providerErrorMessage: clip.providerErrorMessage,
      postprocess: clip.postprocess
        ? (JSON.parse(JSON.stringify(clip.postprocess)) as JsonValue)
        : null,
      qualityScore: clip.qualityScore
    })),
    sora: {
      attempted: soraAttempted,
      available: soraCompletedCount > 0,
      completedCount: soraCompletedCount,
      fallbackCount: failures.length,
      failures
    }
  };
}

interface GenerateMotionClipInput {
  db: DatabaseClient;
  storage: StorageDriver;
  soraProvider: SoraProvider;
  projectId: string;
  petProfile: PetProfile;
  motionKey: PetMotionKey;
  keyframeImageUrls: string[];
  forceFallback: boolean;
  pollAttempts: number;
  pollIntervalMs: number;
}

interface GenerateMotionClipResult {
  clip: MotionClip;
  soraAttempted: boolean;
  soraCompleted: boolean;
  fallbackReason: string | null;
}

async function generateMotionClip(
  input: GenerateMotionClipInput
): Promise<GenerateMotionClipResult> {
  const definition = PET_MOTION_DEFINITIONS[input.motionKey];
  const requestedDurationMs = getSoraRequestedDurationMs(input.motionKey);
  const chromaKeyColor = chooseChromaKeyColor(input.petProfile);
  const prompt = buildSoraMotionPrompt({
    petProfile: input.petProfile,
    motionKey: input.motionKey,
    chromaKeyColor
  });
  let clip = upsertMotionClipRecord(
    {
      projectId: input.projectId,
      petProfileId: input.petProfile.id,
      motionKey: input.motionKey,
      fromState: definition.fromState,
      toState: definition.toState,
      prompt,
      keyframeImageUrls: input.keyframeImageUrls,
      durationMs: definition.durationMs,
      loopable: definition.loopable,
      status: "generating_video"
    },
    input.db
  );

  if (input.forceFallback) {
    const fallbackClip = await applyFallbackStillAnimation(
      clip,
      input,
      "fallback forced for local demo"
    );
    return {
      clip: fallbackClip,
      soraAttempted: false,
      soraCompleted: false,
      fallbackReason: "fallback forced for local demo"
    };
  }

  try {
    const operation = await input.soraProvider.createMotionClip({
      petProfile: input.petProfile,
      motionKey: input.motionKey,
      fromState: definition.fromState,
      toState: definition.toState,
      prompt,
      keyframeImageUrls: await resolveProviderImageUrls(
        input.keyframeImageUrls,
        input.storage
      ),
      context: {
        projectId: input.projectId
      }
    });
    clip = updateMotionClipRecord(
      clip.id,
      {
        providerOperationId: operation.operationId,
        providerStatus: operation.status,
        providerErrorMessage: null,
        status: "generating_video"
      },
      input.db
    ) as MotionClip;
    const finalOperation = await waitForSoraCompletion(
      operation.operationId,
      operation.status,
      input
    );

    if (finalOperation.status !== "succeeded") {
      clip = updateMotionClipRecord(
        clip.id,
        {
          providerStatus: finalOperation.status,
          providerErrorMessage: `sora status ${finalOperation.status}`
        },
        input.db
      ) as MotionClip;
      const fallbackClip = await applyFallbackStillAnimation(
        clip,
        input,
        `sora status ${finalOperation.status}`
      );
      return {
        clip: fallbackClip,
        soraAttempted: true,
        soraCompleted: false,
        fallbackReason: `sora status ${finalOperation.status}`
      };
    }

    const videoBody = await input.soraProvider.downloadMotionClipContent(
      finalOperation.operationId,
      {
        projectId: input.projectId
      }
    );
    const stored = await input.storage.putObject({
      key: `projects/${input.projectId}/pet/videos/${input.motionKey}-${finalOperation.operationId}.mp4`,
      body: videoBody,
      contentType: "video/mp4"
    });
    const alpha = processChromaAlpha({
      rawVideoUrl: stored.url,
      keyframeImageUrls: input.keyframeImageUrls,
      petProfile: input.petProfile
    });
    clip = updateMotionClipRecord(
      clip.id,
      {
        rawVideoUrl: stored.url,
        processedVideoUrl: alpha.processedVideoUrl,
        alphaVideoUrl: alpha.alphaVideoUrl,
        durationMs: requestedDurationMs,
        providerStatus: "succeeded",
        postprocess: {
          chromaKeyColor: alpha.chromaKeyColor,
          alphaStrategy: alpha.strategy,
          shaderUniforms: alpha.shaderUniforms
        },
        status: "processing"
      },
      input.db
    ) as MotionClip;
    clip = await applyQualityScore(
      clip,
      input.petProfile,
      input.db,
      input.storage
    );

    return {
      clip,
      soraAttempted: true,
      soraCompleted: true,
      fallbackReason: null
    };
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? error.message : "sora provider failed";
    clip = updateMotionClipRecord(
      clip.id,
      {
        providerStatus: "failed",
        providerErrorMessage: sanitizeReason(fallbackReason)
      },
      input.db
    ) as MotionClip;
    const fallbackClip = await applyFallbackStillAnimation(
      clip,
      input,
      fallbackReason
    );

    return {
      clip: fallbackClip,
      soraAttempted: true,
      soraCompleted: false,
      fallbackReason
    };
  }
}

async function waitForSoraCompletion(
  operationId: string,
  initialStatus: "queued" | "running" | "succeeded" | "failed",
  input: GenerateMotionClipInput
) {
  let status = initialStatus;

  for (let attempt = 0; attempt < input.pollAttempts; attempt += 1) {
    if (status === "succeeded" || status === "failed") {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
    const operation = await input.soraProvider.getMotionClip(operationId, {
      projectId: input.projectId
    });
    status = operation.status;
  }

  return { operationId, status };
}

async function applyFallbackStillAnimation(
  clip: MotionClip,
  input: GenerateMotionClipInput,
  reason: string
): Promise<MotionClip> {
  const fallback = await createFallbackStillAnimationAsset({
    projectId: input.projectId,
    motionKey: input.motionKey,
    stillImageUrl: input.keyframeImageUrls[0] ?? null,
    petProfile: input.petProfile,
    storage: input.storage
  });
  const updated = updateMotionClipRecord(
    clip.id,
    {
      rawVideoUrl: null,
      processedVideoUrl: fallback.url,
      alphaVideoUrl: null,
      durationMs: fallback.durationMs,
      loopable: fallback.loopable,
      providerStatus: clip.providerStatus,
      providerErrorMessage: sanitizeReason(reason),
      postprocess: {
        chromaKeyColor: chooseChromaKeyColor(input.petProfile),
        alphaStrategy: "fallback-still",
        shaderUniforms: processChromaAlpha({
          rawVideoUrl: null,
          keyframeImageUrls: input.keyframeImageUrls,
          petProfile: input.petProfile
        }).shaderUniforms
      },
      status: "processing"
    },
    input.db
  ) as MotionClip;

  return applyQualityScore(
    {
      ...updated,
      prompt: `${updated.prompt}\nFallback reason: ${sanitizeReason(reason)}`
    },
    input.petProfile,
    input.db,
    input.storage
  );
}

async function applyQualityScore(
  clip: MotionClip,
  petProfile: PetProfile,
  db: DatabaseClient,
  storage: StorageDriver
): Promise<MotionClip> {
  const evaluation = await evaluateMotionClipQuality({
    clip,
    petProfile,
    storage
  });

  return updateMotionClipRecord(
    clip.id,
    {
      qualityScore: evaluation.score,
      status: evaluation.passed ? "ready" : "failed"
    },
    db
  ) as MotionClip;
}

function normalizeMotionKeys(motionKeys: string[] | undefined): PetMotionKey[] {
  const normalized = uniquePetMotionKeys(motionKeys);
  return normalized.length > 0 ? normalized : [...REQUIRED_MOTION_KEYS];
}

function resolveJobPetProfile(
  projectId: string,
  payloadProfile: PetProfile,
  db: DatabaseClient
): PetProfile {
  const project = getProjectRecord(projectId, db);

  if (project?.selectedPetId) {
    const selectedProfile = getPetProfileRecord(project.selectedPetId, db);
    if (!selectedProfile || selectedProfile.projectId !== projectId) {
      throw new Error("Selected pet profile is missing or belongs to another project.");
    }
    if (payloadProfile.id !== selectedProfile.id) {
      throw new Error("Pet video payload does not match the selected pet.");
    }
    return selectedProfile;
  }

  throw new Error("Pet video job requires a persisted selected pet.");
}

function getSoraRequestedDurationMs(motionKey: PetMotionKey): number {
  return motionKey === "turn_360" || motionKey === "walk_small" ? 8_000 : 4_000;
}

function coercePayload(payload: JsonValue): PetVideoJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("pet-video payload must be an object.");
  }

  const record = payload as Record<string, unknown>;

  if (!record.petProfile || typeof record.petProfile !== "object") {
    throw new Error("pet-video payload requires petProfile.");
  }

  return {
    petProfile: record.petProfile as PetProfile,
    motionKeys: Array.isArray(record.motionKeys)
      ? record.motionKeys.filter(
          (motionKey): motionKey is string => typeof motionKey === "string"
        )
      : undefined,
    keyframeImageUrlsByMotion: isStringArrayRecord(record.keyframeImageUrlsByMotion)
      ? record.keyframeImageUrlsByMotion
      : undefined,
    forceFallback: record.forceFallback === true
  };
}

function isStringArrayRecord(
  value: unknown
): value is Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(
    (item) =>
      Array.isArray(item) &&
      item.every((nestedItem) => typeof nestedItem === "string")
  );
}

function sanitizeReason(reason: string): string {
  return reason.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}
