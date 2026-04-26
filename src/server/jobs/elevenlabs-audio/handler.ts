import { getElevenLabsApiKey } from "@/lib/env";
import {
  type AudioPromptPlan,
  type AudioPromptPlanner,
  BACKGROUND_MUSIC_ASSET_KEY,
  BACKGROUND_MUSIC_DURATION_MS,
  PET_SOUND_EFFECT_DURATION_SECONDS,
  PET_SOUND_EFFECT_INTENTS,
  buildFallbackAudioPromptPlan,
  createAudioPromptPlanner,
  upsertAudioAssetRecord
} from "@/server/audio";
import { getSelectedSceneClusterForProject } from "@/server/assets/world-assets";
import { getDatabase, getProjectRecord, type DatabaseClient } from "@/server/db";
import { getPetProfileRecord } from "@/server/jobs/pet-analysis/pet-profile-repository";
import { markProjectReadyIfAssetsComplete, updateProjectToStage } from "@/server/projects/pipeline";
import { listUploadedImages } from "@/server/projects/repository";
import { getLoadingStage } from "@/server/projects/stages";
import {
  createElevenLabsProvider,
  type ElevenLabsAudioResult,
  type ElevenLabsProvider
} from "@/server/providers";
import { createLocalStorageDriver, type StorageDriver } from "@/server/storage";
import type { GenerationJob, JsonValue, PetProfile } from "@/types";

export interface ElevenLabsAudioHandlerDeps {
  db?: DatabaseClient;
  storage?: StorageDriver;
  provider?: ElevenLabsProvider | null;
  promptPlanner?: AudioPromptPlanner | null;
}

interface PlannedAudioAsset {
  kind: "background_music" | "pet_sound_effect";
  assetKey: string;
  prompt: string;
  durationMs: number;
}

export async function handleElevenLabsAudioJob(
  job: GenerationJob,
  deps: ElevenLabsAudioHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const storage = deps.storage ?? createLocalStorageDriver();
  const provider =
    deps.provider === undefined
      ? getElevenLabsApiKey()
        ? createElevenLabsProvider()
        : null
      : deps.provider;
  const context = getAudioGenerationContext(job.projectId, db);
  const promptPlan = provider
    ? await getAudioPromptPlan(context, { ...deps, storage })
    : buildFallbackAudioPromptPlan(context);
  const stage = getLoadingStage(5);

  updateProjectToStage(
    job.projectId,
    {
      status: "preparing_pet",
      currentStage: stage.title,
      currentStepIndex: stage.index,
      debugProgressPercent: 92
    },
    db
  );

  const plannedAssets = buildPlannedAudioAssets(promptPlan);

  if (!provider) {
    for (const asset of plannedAssets) {
      upsertAudioAssetRecord(
        {
          projectId: job.projectId,
          ...asset,
          audioUrl: null,
          providerName: "elevenlabs",
          providerStatus: "skipped",
          providerErrorMessage: "ELEVENLABS_API_KEY is not configured.",
          status: "skipped"
        },
        db
      );
    }

    markProjectReadyIfAssetsComplete(job.projectId, db);

    return {
      provider: "elevenlabs",
      status: "skipped",
      reason: "missing-api-key",
      promptSource: promptPlan.source,
      promptModel: promptPlan.model,
      assets: plannedAssets.map(({ kind, assetKey }) => ({ kind, assetKey }))
    } as JsonValue;
  }

  const generatedAssets: JsonValue[] = [];
  const skippedAssets: JsonValue[] = [];

  for (const asset of plannedAssets) {
    try {
      upsertAudioAssetRecord(
        {
          projectId: job.projectId,
          ...asset,
          audioUrl: null,
          providerName: "elevenlabs",
          providerStatus: "running",
          providerErrorMessage: null,
          status: "generating"
        },
        db
      );

      const generated =
        asset.kind === "background_music"
          ? await provider.composeMusic({
              prompt: asset.prompt,
              musicLengthMs: asset.durationMs,
              forceInstrumental: true,
              context: { projectId: job.projectId }
            })
          : await provider.createSoundEffect({
              text: asset.prompt,
              durationSeconds: Math.max(0.5, asset.durationMs / 1_000),
              loop: false,
              promptInfluence: 0.45,
              context: { projectId: job.projectId }
            });
      const stored = await storeGeneratedAudio({
        projectId: job.projectId,
        asset,
        generated,
        storage
      });

      upsertAudioAssetRecord(
        {
          projectId: job.projectId,
          ...asset,
          audioUrl: stored.url,
          contentType: stored.contentType,
          providerName: "elevenlabs",
          providerStatus: "succeeded",
          providerErrorMessage: null,
          status: "ready"
        },
        db
      );
      generatedAssets.push({
        kind: asset.kind,
        assetKey: asset.assetKey,
        audioUrl: stored.url
      });
    } catch (error) {
      const reason = sanitizeProviderError(error);

      if (!isFinalJobAttempt(job)) {
        upsertAudioAssetRecord(
          {
            projectId: job.projectId,
            ...asset,
            audioUrl: null,
            providerName: "elevenlabs",
            providerStatus: "failed",
            providerErrorMessage: reason,
            status: "failed"
          },
          db
        );
        throw new Error(reason);
      }

      upsertAudioAssetRecord(
        {
          projectId: job.projectId,
          ...asset,
          audioUrl: null,
          providerName: "elevenlabs",
          providerStatus: "skipped",
          providerErrorMessage: reason,
          status: "skipped"
        },
        db
      );
      skippedAssets.push({
        kind: asset.kind,
        assetKey: asset.assetKey,
        reason
      });
    }
  }

  markProjectReadyIfAssetsComplete(job.projectId, db);

  return {
    provider: "elevenlabs",
    status: skippedAssets.length > 0 ? "partial" : "ready",
    promptSource: promptPlan.source,
    promptModel: promptPlan.model,
    generatedAssets,
    skippedAssets
  } as JsonValue;
}

function getAudioGenerationContext(
  projectId: string,
  db: DatabaseClient
): {
  projectId: string;
  petProfile: PetProfile;
  sceneLabel: string | null;
  spatialPrompt: string | null;
  imageUrls: string[];
} {
  const project = getProjectRecord(projectId, db);

  if (!project?.selectedPetId) {
    throw new Error("ElevenLabs audio generation requires a selected pet.");
  }

  const petProfile = getPetProfileRecord(project.selectedPetId, db);

  if (!petProfile) {
    throw new Error("ElevenLabs audio generation could not find the selected pet.");
  }

  const sceneCluster = getSelectedSceneClusterForProject(projectId, db);
  const uploadedImageUrls = listUploadedImages(projectId, db).map(
    (image) => image.originalUrl
  );
  const sceneImageUrls = sceneCluster?.seedImageUrls ?? [];

  return {
    projectId,
    petProfile,
    sceneLabel: sceneCluster?.label ?? null,
    spatialPrompt: sceneCluster?.spatialPrompt ?? null,
    imageUrls: uniqueStrings([...uploadedImageUrls, ...sceneImageUrls])
  };
}

async function getAudioPromptPlan(
  context: {
    projectId: string;
    petProfile: PetProfile;
    sceneLabel: string | null;
    spatialPrompt: string | null;
    imageUrls: string[];
  },
  deps: ElevenLabsAudioHandlerDeps
): Promise<AudioPromptPlan> {
  const fallback = buildFallbackAudioPromptPlan(context);
  const promptPlanner =
    deps.promptPlanner === undefined
      ? createAudioPromptPlanner({ storage: deps.storage })
      : deps.promptPlanner;

  if (!promptPlanner) {
    return fallback;
  }

  try {
    return await promptPlanner.planAudioPrompts(context);
  } catch {
    return fallback;
  }
}

function buildPlannedAudioAssets(input: AudioPromptPlan): PlannedAudioAsset[] {
  return [
    {
      kind: "background_music",
      assetKey: BACKGROUND_MUSIC_ASSET_KEY,
      prompt: input.backgroundMusicPrompt,
      durationMs: BACKGROUND_MUSIC_DURATION_MS
    },
    ...PET_SOUND_EFFECT_INTENTS.map((intent) => ({
      kind: "pet_sound_effect" as const,
      assetKey: intent,
      prompt: input.petSoundEffects[intent],
      durationMs: Math.round(PET_SOUND_EFFECT_DURATION_SECONDS * 1_000)
    }))
  ];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function storeGeneratedAudio(input: {
  projectId: string;
  asset: PlannedAudioAsset;
  generated: ElevenLabsAudioResult;
  storage: StorageDriver;
}) {
  return input.storage.putObject({
    key: `projects/${input.projectId}/audio/${input.asset.assetKey}.mp3`,
    body: input.generated.audio,
    contentType: input.generated.contentType
  });
}

function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "ElevenLabs audio failed.";
  const apiKey = getElevenLabsApiKey();
  const redacted = apiKey ? raw.replaceAll(apiKey, "[redacted]") : raw;

  return redacted
    .replaceAll(/xi-api-key[=:]\s*[\w.-]+/gi, "xi-api-key=[redacted]")
    .replaceAll(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function isFinalJobAttempt(job: Pick<GenerationJob, "attempts" | "maxAttempts">) {
  return job.maxAttempts <= 1 || job.attempts >= job.maxAttempts;
}
