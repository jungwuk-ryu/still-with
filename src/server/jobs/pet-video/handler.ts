import type { DatabaseClient } from "@/server/db";
import { getDatabase, getProjectRecord } from "@/server/db";
import { getGeminiApiKey } from "@/lib/env";
import {
  markProjectReadyIfAssetsComplete,
  updateProjectToStage
} from "@/server/projects/pipeline";
import { getLoadingStage } from "@/server/projects/stages";
import {
  createSoraProvider,
  createVeoProvider,
  type MotionVideoProvider,
  type SoraProvider,
  type VeoProvider
} from "@/server/providers";
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
  veoProvider?: VeoProvider | null;
  soraProvider?: SoraProvider | null;
  pollAttempts?: number;
  pollIntervalMs?: number;
}

export async function handlePetVideoJob(
  job: GenerationJob,
  deps: PetVideoHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const storage = deps.storage ?? createLocalStorageDriver();
  const veoProvider =
    deps.veoProvider === undefined ? createVeoProviderIfConfigured() : deps.veoProvider;
  const soraProvider =
    deps.soraProvider === undefined ? createSoraProvider() : deps.soraProvider;
  const payload = coercePayload(job.payload);
  const petProfile = resolveJobPetProfile(job.projectId, payload.petProfile, db);
  const stage = getLoadingStage(4);
  updateProjectToStage(
    job.projectId,
    {
      status: "preparing_pet",
      currentStage: stage.title,
      currentStepIndex: stage.index,
      debugProgressPercent: 78,
      selectedPetId: petProfile.id
    },
    db
  );
  const motionKeys = normalizeMotionKeys(payload.motionKeys);
  const generatedClips: MotionClip[] = [];
  const failures: Array<{
    motionKey: PetMotionKey;
    providerName: string;
    reason: string;
  }> = [];
  let veoAttempted = false;
  let veoCompletedCount = 0;
  let veoFailedCount = 0;
  let soraAttempted = false;
  let soraCompletedCount = 0;
  let soraFailedCount = 0;

  for (const motionKey of motionKeys) {
    const result = await generateMotionClip({
      db,
      storage,
      veoProvider,
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

    veoAttempted ||= result.veoAttempted;
    if (result.veoCompleted) {
      veoCompletedCount += 1;
    }
    if (result.veoFailed) {
      veoFailedCount += 1;
    }
    soraAttempted ||= result.soraAttempted;
    if (result.soraCompleted) {
      soraCompletedCount += 1;
    }
    if (result.soraFailed) {
      soraFailedCount += 1;
    }
    if (result.fallbackReason) {
      failures.push({
        motionKey,
        providerName: result.fallbackProviderName ?? "fallback",
        reason: result.fallbackReason
      });
    }
    generatedClips.push(result.clip);
  }

  markProjectReadyIfAssetsComplete(job.projectId, db);

  return {
    clips: generatedClips.map((clip) => ({
      id: clip.id,
      motionKey: clip.motionKey,
      status: clip.status,
      rawVideoUrl: clip.rawVideoUrl,
      processedVideoUrl: clip.processedVideoUrl,
      alphaVideoUrl: clip.alphaVideoUrl,
      providerOperationId: clip.providerOperationId,
      providerName: clip.providerName,
      providerStatus: clip.providerStatus,
      providerErrorMessage: clip.providerErrorMessage,
      postprocess: clip.postprocess
        ? (JSON.parse(JSON.stringify(clip.postprocess)) as JsonValue)
        : null,
      qualityScore: clip.qualityScore
    })),
    videoProviderPriority: ["veo", "sora", "fallback"],
    veo: {
      attempted: veoAttempted,
      available: veoCompletedCount > 0,
      completedCount: veoCompletedCount,
      failedCount: veoFailedCount,
      fallbackCount: failures.filter((failure) => failure.providerName === "veo")
        .length
    },
    sora: {
      attempted: soraAttempted,
      available: soraCompletedCount > 0,
      completedCount: soraCompletedCount,
      failedCount: soraFailedCount,
      fallbackCount: failures.filter((failure) => failure.providerName === "sora")
        .length
    },
    fallback: {
      count: failures.length,
      failures
    }
  };
}

interface GenerateMotionClipInput {
  db: DatabaseClient;
  storage: StorageDriver;
  veoProvider: VeoProvider | null;
  soraProvider: SoraProvider | null;
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
  veoAttempted: boolean;
  veoCompleted: boolean;
  veoFailed: boolean;
  soraAttempted: boolean;
  soraCompleted: boolean;
  soraFailed: boolean;
  fallbackReason: string | null;
  fallbackProviderName: MotionVideoProvider["providerName"] | "fallback" | null;
}

async function generateMotionClip(
  input: GenerateMotionClipInput
): Promise<GenerateMotionClipResult> {
  const definition = PET_MOTION_DEFINITIONS[input.motionKey];
  const requestedDurationMs = getMotionRequestedDurationMs(input.motionKey);
  const chromaKeyColor = chooseChromaKeyColor(input.petProfile);
  const prompt = buildSoraMotionPrompt({
    petProfile: input.petProfile,
    motionKey: input.motionKey,
    chromaKeyColor
  });
  const clip = upsertMotionClipRecord(
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
      veoAttempted: false,
      veoCompleted: false,
      veoFailed: false,
      soraAttempted: false,
      soraCompleted: false,
      soraFailed: false,
      fallbackReason: "fallback forced for local demo",
      fallbackProviderName: "fallback"
    };
  }

  const providers = selectVideoProviders(input);
  const result: GenerateMotionClipResult = {
    clip,
    veoAttempted: false,
    veoCompleted: false,
    veoFailed: false,
    soraAttempted: false,
    soraCompleted: false,
    soraFailed: false,
    fallbackReason: null,
    fallbackProviderName: null
  };
  let fallbackReason =
    providers.length === 0 ? "no remote pet video provider configured" : null;
  let fallbackProviderName: GenerateMotionClipResult["fallbackProviderName"] =
    providers.length === 0 ? "fallback" : null;

  for (const provider of providers) {
    if (provider.providerName === "veo") {
      result.veoAttempted = true;
    } else {
      result.soraAttempted = true;
    }

    const attempt = await attemptRemoteMotionProvider({
      provider,
      clip: result.clip,
      prompt,
      requestedDurationMs,
      input
    });
    result.clip = attempt.clip;

    if (attempt.completed) {
      if (provider.providerName === "veo") {
        result.veoCompleted = true;
      } else {
        result.soraCompleted = true;
      }
      return result;
    }

    fallbackReason = sanitizeReason(attempt.reason);
    fallbackProviderName = provider.providerName;
    if (provider.providerName === "veo") {
      result.veoFailed = true;
    } else {
      result.soraFailed = true;
    }
  }

  if (providers.length === 0) {
    result.clip = updateMotionClipRecord(
      result.clip.id,
      {
        providerName: "fallback",
        providerStatus: "skipped",
        providerErrorMessage: sanitizeReason(fallbackReason ?? "")
      },
      input.db
    ) as MotionClip;
  }

  const fallbackClip = await applyFallbackStillAnimation(
    result.clip,
    input,
    fallbackReason ?? "remote pet video providers failed"
  );

  return {
    ...result,
    clip: fallbackClip,
    fallbackReason: sanitizeReason(
      fallbackReason ?? "remote pet video providers failed"
    ),
    fallbackProviderName: fallbackProviderName ?? "fallback"
  };
}

interface RemoteProviderAttemptInput {
  provider: MotionVideoProvider;
  clip: MotionClip;
  prompt: string;
  requestedDurationMs: number;
  input: GenerateMotionClipInput;
}

interface RemoteProviderAttemptResult {
  clip: MotionClip;
  completed: boolean;
  reason: string;
}

async function attemptRemoteMotionProvider(
  attempt: RemoteProviderAttemptInput
): Promise<RemoteProviderAttemptResult> {
  const { provider, input } = attempt;
  const definition = PET_MOTION_DEFINITIONS[input.motionKey];

  try {
    const operation = await provider.createMotionClip({
      petProfile: input.petProfile,
      motionKey: input.motionKey,
      fromState: definition.fromState,
      toState: definition.toState,
      prompt: attempt.prompt,
      keyframeImageUrls: await resolveProviderImageUrls(
        input.keyframeImageUrls,
        input.storage
      ),
      context: {
        projectId: input.projectId
      }
    });
    let clip = updateMotionClipRecord(
      attempt.clip.id,
      {
        providerName: provider.providerName,
        providerOperationId: operation.operationId,
        providerStatus: operation.status,
        providerErrorMessage: null,
        status: "generating_video"
      },
      input.db
    ) as MotionClip;
    const finalOperation = await waitForProviderCompletion(
      provider,
      operation.operationId,
      operation.status,
      input
    );

    if (finalOperation.status !== "succeeded") {
      const reason = `${provider.providerName} status ${finalOperation.status}`;
      clip = updateMotionClipRecord(
        clip.id,
        {
          providerStatus: finalOperation.status,
          providerErrorMessage: reason
        },
        input.db
      ) as MotionClip;
      return { clip, completed: false, reason: sanitizeReason(reason) };
    }

    const videoBody = await provider.downloadMotionClipContent(
      finalOperation.operationId,
      {
        projectId: input.projectId
      }
    );
    const stored = await input.storage.putObject({
      key: `projects/${input.projectId}/pet/videos/${input.motionKey}-${provider.providerName}-${toStorageSafeToken(finalOperation.operationId)}.mp4`,
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
        durationMs: attempt.requestedDurationMs,
        providerName: provider.providerName,
        providerStatus: "succeeded",
        providerErrorMessage: null,
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
    if (clip.status !== "ready") {
      const reason = `${provider.providerName} quality gate failed`;
      clip = updateMotionClipRecord(
        clip.id,
        {
          providerStatus: "failed",
          providerErrorMessage: reason
        },
        input.db
      ) as MotionClip;
      return { clip, completed: false, reason: sanitizeReason(reason) };
    }

    return { clip, completed: true, reason: "" };
  } catch (error) {
    const reason = sanitizeReason(
      error instanceof Error
        ? error.message
        : `${provider.providerName} provider failed`
    );
    const clip = updateMotionClipRecord(
      attempt.clip.id,
      {
        providerName: provider.providerName,
        providerStatus: "failed",
        providerErrorMessage: reason
      },
      input.db
    ) as MotionClip;

    return { clip, completed: false, reason };
  }
}

async function waitForProviderCompletion(
  provider: MotionVideoProvider,
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
    const operation = await provider.getMotionClip(operationId, {
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
      providerName: clip.providerName ?? "fallback",
      providerStatus: clip.providerStatus ?? "skipped",
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

function createVeoProviderIfConfigured(): VeoProvider | null {
  return getGeminiApiKey() ? createVeoProvider() : null;
}

function selectVideoProviders(
  input: GenerateMotionClipInput
): MotionVideoProvider[] {
  const providers: MotionVideoProvider[] = [];

  if (input.veoProvider) {
    providers.push(input.veoProvider);
  }
  if (input.soraProvider) {
    providers.push(input.soraProvider);
  }

  return providers;
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

function getMotionRequestedDurationMs(motionKey: PetMotionKey): number {
  return motionKey === "turn_360" || motionKey === "walk_small" ? 8_000 : 4_000;
}

function toStorageSafeToken(operationId: string): string {
  return operationId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "");
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
  return reason
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(
      /(x-goog-api-key\s*[:=]\s*)[A-Za-z0-9._-]+/gi,
      "$1[redacted]"
    )
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[redacted-google-api-key]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[redacted-openai-api-key]");
}
