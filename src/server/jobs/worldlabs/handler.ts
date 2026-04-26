import { createWorldLabsProvider } from "@/server/providers";
import type { WorldLabsOperation, WorldLabsProvider } from "@/server/providers";
import { createGenerationJob } from "@/server/jobs/repository";
import type { GenerationJobHandler } from "@/server/jobs/worker";
import type { DatabaseClient } from "@/server/db";
import {
  enqueueElevenLabsAudioJob,
  markProjectReadyIfAssetsComplete,
  updateProjectToStage
} from "@/server/projects/pipeline";
import { getLoadingStage } from "@/server/projects/stages";
import {
  getSceneClusterRecord,
  persistWorldAssetManifest,
  updateSceneClusterRecord
} from "@/server/assets/world-assets";
import type { JsonValue, WorldAsset } from "@/types";

const DEFAULT_INITIAL_POLL_DELAY_MS = 15_000;
const DEFAULT_MAX_POLLS = 60;

export interface WorldLabsGenerationHandlerOptions {
  db: DatabaseClient;
  provider?: WorldLabsProvider;
  initialPollDelayMs?: number;
  maxPolls?: number;
}

interface WorldLabsGenerationPayload {
  sceneClusterId?: string;
  operationId?: string;
  pollAttempt?: number;
  inputMode?: "multi-image" | "panorama" | "single-image";
  textPrompt?: string;
  backgroundSpace?: boolean;
  seedImages?: Array<{
    url: string;
    view?: "front" | "left" | "right" | "back" | "panorama";
    azimuth?: number | null;
  }>;
}

export function createWorldLabsGenerationHandler(
  options: WorldLabsGenerationHandlerOptions
): GenerationJobHandler {
  const provider = options.provider ?? createWorldLabsProvider();
  const initialPollDelayMs =
    options.initialPollDelayMs ?? DEFAULT_INITIAL_POLL_DELAY_MS;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;

  return async (job) => {
    const payload = parsePayload(job.payload);

    if (!payload.sceneClusterId) {
      throw new Error("World Labs generation job requires sceneClusterId.");
    }

    const sceneCluster = getSceneClusterRecord(payload.sceneClusterId, options.db);

    if (!sceneCluster) {
      throw new Error("World Labs generation job could not find scene cluster.");
    }

    const operationId =
      payload.operationId ??
      (sceneCluster.status === "failed" ? null : sceneCluster.worldLabsOperationId);

    if (!operationId) {
      if (!payload.backgroundSpace) {
        const stage = getLoadingStage(3);
        updateProjectToStage(
          job.projectId,
          {
            status: "preparing_space",
            currentStage: stage.title,
            currentStepIndex: stage.index,
            debugProgressPercent: 48
          },
          options.db
        );
      }
      let operation;

      try {
        operation = await provider.createWorld({
          sceneCluster,
          seedImageUrls:
            payload.seedImages?.map((seedImage) => seedImage.url) ??
            sceneCluster.seedImageUrls,
          seedImages: payload.seedImages,
          inputMode: payload.inputMode,
          textPrompt: payload.textPrompt ?? sceneCluster.spatialPrompt ?? undefined,
          context: {
            projectId: job.projectId,
            sceneClusterId: sceneCluster.id
          }
        });
      } catch (error) {
        if (isFinalJobAttempt(job)) {
          updateSceneClusterRecord(
            sceneCluster.id,
            {
              status: "failed"
            },
            options.db
          );
        }

        throw error;
      }

      const persistAndEnqueue = options.db.transaction(() => {
        updateSceneClusterRecord(
          sceneCluster.id,
          {
            worldLabsOperationId: operation.operationId,
            worldId: operation.worldId,
            status: "waiting_for_world"
          },
          options.db
        );

        enqueuePollJob(
          {
            projectId: job.projectId,
            sceneClusterId: sceneCluster.id,
            operationId: operation.operationId,
            pollAttempt: 1,
            priority: job.priority,
            delayMs: initialPollDelayMs,
            sourcePayload: payload
          },
          options.db
        );
      });
      persistAndEnqueue();

      return {
        sceneClusterId: sceneCluster.id,
        operationId: operation.operationId,
        status: operation.status,
        nextPollInMs: initialPollDelayMs
      } as JsonValue;
    }

    if ((payload.pollAttempt ?? 0) > maxPolls) {
      updateSceneClusterRecord(
        sceneCluster.id,
        {
          status: "failed"
        },
        options.db
      );
      throw new Error("World Labs operation polling exceeded the configured limit.");
    }

    let operation: WorldLabsOperation;

    try {
      operation = await provider.getOperation(operationId, {
        projectId: job.projectId,
        sceneClusterId: sceneCluster.id
      });
    } catch (error) {
      if (isFinalJobAttempt(job)) {
        updateSceneClusterRecord(
          sceneCluster.id,
          {
            status: "failed"
          },
          options.db
        );
      }

      throw error;
    }

    if (operation.status === "failed") {
      updateSceneClusterRecord(
        sceneCluster.id,
        {
          status: "failed",
          worldId: operation.worldId
        },
        options.db
      );
      throw new Error("World Labs operation failed.");
    }

    if (operation.status !== "succeeded") {
      const pollAttempt = (payload.pollAttempt ?? 1) + 1;
      const delayMs = getPollDelayMs(pollAttempt);

      const persistAndEnqueue = options.db.transaction(() => {
        updateSceneClusterRecord(
          sceneCluster.id,
          {
            worldId: operation.worldId,
            status: "waiting_for_world"
          },
          options.db
        );

        enqueuePollJob(
          {
            projectId: job.projectId,
            sceneClusterId: sceneCluster.id,
            operationId,
            pollAttempt,
            priority: job.priority,
            delayMs,
            sourcePayload: payload
          },
          options.db
        );
      });
      persistAndEnqueue();

      return {
        sceneClusterId: sceneCluster.id,
        operationId,
        status: operation.status,
        pollAttempt,
        nextPollInMs: delayMs
      } as JsonValue;
    }

    const worldId = operation.worldId;

    if (!worldId) {
      updateSceneClusterRecord(
        sceneCluster.id,
        {
          status: "failed"
        },
        options.db
      );
      throw new Error("World Labs operation completed without a world id.");
    }

    let fetchedAsset: WorldAsset;

    try {
      fetchedAsset = await provider.getWorldAssets(worldId, {
        projectId: job.projectId,
        sceneClusterId: sceneCluster.id
      });
    } catch (error) {
      if (isFinalJobAttempt(job)) {
        updateSceneClusterRecord(
          sceneCluster.id,
          {
            worldId,
            status: "failed"
          },
          options.db
        );
      }

      throw error;
    }
    const asset = applyWorldAssetFallbacks(
      fetchedAsset,
      getFallbackSeedImages(sceneCluster.seedImageUrls, payload.seedImages),
      payload.inputMode
    );
    const manifestResult = await (async () => {
      try {
        validateCompletedWorldAsset(asset);
        return await persistWorldAssetManifest(asset, {
          db: options.db
        });
      } catch (error) {
        if (isFinalJobAttempt(job)) {
          updateSceneClusterRecord(
            sceneCluster.id,
            {
              worldId,
              status: "failed"
            },
            options.db
          );
        }

        throw error;
      }
    })();

    updateSceneClusterRecord(
      sceneCluster.id,
      {
        worldId,
        status: "ready"
      },
      options.db
    );
    if (payload.backgroundSpace) {
      enqueueElevenLabsAudioJob(job.projectId, options.db, {
        sceneClusterId: sceneCluster.id
      });
    } else {
      markProjectReadyIfAssetsComplete(job.projectId, options.db);
    }

    return {
      sceneClusterId: sceneCluster.id,
      worldId,
      worldAssetId: asset.id,
      manifestUrl: manifestResult.manifestUrl,
      renderMode: manifestResult.manifest.renderMode
    } as JsonValue;
  };
}

function enqueuePollJob(
  input: {
    projectId: string;
    sceneClusterId: string;
    operationId: string;
    pollAttempt: number;
    priority: number;
    delayMs: number;
    sourcePayload: WorldLabsGenerationPayload;
  },
  db: DatabaseClient
): void {
  createGenerationJob(
    {
      projectId: input.projectId,
      type: "worldlabs-generation",
      payload: buildPollPayload(input),
      priority: input.priority,
      runAfter: new Date(Date.now() + input.delayMs),
      maxAttempts: 3
    },
    db
  );
}

function buildPollPayload(input: {
  sceneClusterId: string;
  operationId: string;
  pollAttempt: number;
  sourcePayload: WorldLabsGenerationPayload;
}): JsonValue {
  const payload: Record<string, JsonValue> = {
    sceneClusterId: input.sceneClusterId,
    operationId: input.operationId,
    pollAttempt: input.pollAttempt
  };

  if (input.sourcePayload.inputMode) {
    payload.inputMode = input.sourcePayload.inputMode;
  }

  if (input.sourcePayload.textPrompt) {
    payload.textPrompt = input.sourcePayload.textPrompt;
  }

  if (input.sourcePayload.backgroundSpace) {
    payload.backgroundSpace = true;
  }

  if (input.sourcePayload.seedImages) {
    payload.seedImages = input.sourcePayload.seedImages.map((seedImage) => ({
      url: seedImage.url,
      ...(seedImage.view ? { view: seedImage.view } : {}),
      ...(seedImage.azimuth !== undefined ? { azimuth: seedImage.azimuth } : {})
    }));
  }

  return payload;
}

export function applyWorldAssetFallbacks(
  asset: WorldAsset,
  seedImages: Array<{ url: string; view?: string }>,
  inputMode?: WorldLabsGenerationPayload["inputMode"]
): WorldAsset {
  const panoramaFallbackUrl = getPanoramaFallbackUrl(seedImages, inputMode);
  const thumbnailFallbackUrl = seedImages[0]?.url ?? null;

  return {
    ...asset,
    panoUrl: asset.panoUrl ?? panoramaFallbackUrl,
    thumbnailUrl: asset.thumbnailUrl ?? thumbnailFallbackUrl
  };
}

export function validateCompletedWorldAsset(asset: WorldAsset): void {
  const hasSpz = Boolean(asset.spzUrl100k || asset.spzUrl500k || asset.spzUrlFullRes);
  const hasCompleteSpz = hasSpz && Boolean(asset.colliderMeshUrl);

  if (!hasCompleteSpz && !asset.panoUrl && !asset.thumbnailUrl) {
    throw new Error("World Labs completed world did not include a renderable asset.");
  }
}

function getFallbackSeedImages(
  seedImageUrls: string[],
  payloadSeedImages: WorldLabsGenerationPayload["seedImages"]
): Array<{ url: string; view?: string }> {
  if (payloadSeedImages && payloadSeedImages.length > 0) {
    return payloadSeedImages.map((seedImage) => ({
      url: seedImage.url,
      ...(seedImage.view ? { view: seedImage.view } : {})
    }));
  }

  return seedImageUrls.map((url) => ({ url }));
}

function getPanoramaFallbackUrl(
  seedImages: Array<{ url: string; view?: string }>,
  inputMode?: WorldLabsGenerationPayload["inputMode"]
): string | null {
  const panoramaSeed = seedImages.find((seedImage) => seedImage.view === "panorama");

  if (panoramaSeed) {
    return panoramaSeed.url;
  }

  if (inputMode === "panorama" && seedImages.length === 1) {
    return seedImages[0]?.url ?? null;
  }

  return null;
}

function getPollDelayMs(pollAttempt: number): number {
  const baseDelay = Math.min(60_000, 10_000 + pollAttempt * 2_500);
  const jitter = Math.floor(Math.random() * 1_000);
  return baseDelay + jitter;
}

function parsePayload(payload: JsonValue): WorldLabsGenerationPayload {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, JsonValue>;
  return {
    sceneClusterId:
      typeof record.sceneClusterId === "string" ? record.sceneClusterId : undefined,
    operationId:
      typeof record.operationId === "string" ? record.operationId : undefined,
    pollAttempt:
      typeof record.pollAttempt === "number" ? record.pollAttempt : undefined,
    inputMode: isInputMode(record.inputMode) ? record.inputMode : undefined,
    textPrompt: typeof record.textPrompt === "string" ? record.textPrompt : undefined,
    backgroundSpace: record.backgroundSpace === true,
    seedImages: parseSeedImages(record.seedImages)
  };
}

function parseSeedImages(value: JsonValue): WorldLabsGenerationPayload["seedImages"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.reduce<NonNullable<WorldLabsGenerationPayload["seedImages"]>>(
    (seedImages, item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return seedImages;
      }

      const record = item as Record<string, JsonValue>;

      if (typeof record.url !== "string") {
        return seedImages;
      }

      const seedImage: NonNullable<
        WorldLabsGenerationPayload["seedImages"]
      >[number] = {
        url: record.url
      };

      if (isSeedView(record.view)) {
        seedImage.view = record.view;
      }

      if (typeof record.azimuth === "number" || record.azimuth === null) {
        seedImage.azimuth = record.azimuth;
      }

      seedImages.push(seedImage);
      return seedImages;
    },
    []
  );
}

function isInputMode(
  value: JsonValue
): value is NonNullable<WorldLabsGenerationPayload["inputMode"]> {
  return value === "multi-image" || value === "panorama" || value === "single-image";
}

function isSeedView(
  value: JsonValue
): value is NonNullable<
  NonNullable<WorldLabsGenerationPayload["seedImages"]>[number]["view"]
> {
  return (
    value === "front" ||
    value === "left" ||
    value === "right" ||
    value === "back" ||
    value === "panorama"
  );
}

function isFinalJobAttempt(job: { attempts: number; maxAttempts: number }): boolean {
  return job.maxAttempts <= 1 || job.attempts >= job.maxAttempts;
}
