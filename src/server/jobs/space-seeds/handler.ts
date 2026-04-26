import {
  OpenAISceneSeedGenerator,
  planSceneSeeds,
  type GeneratedSeedImage,
  type SceneSeedGenerator,
  type SceneSeedStrategy
} from "@/ai/scene";
import { createGenerationJob } from "@/server/jobs/repository";
import type { GenerationJobHandler } from "@/server/jobs/worker";
import type { DatabaseClient } from "@/server/db";
import {
  getSceneClusterRecord,
  getUploadedImagesByIds,
  updateSceneClusterRecord
} from "@/server/assets/world-assets";
import type { JsonValue } from "@/types";

export interface SpaceSeedHandlerOptions {
  db: DatabaseClient;
  seedGenerator?: SceneSeedGenerator;
  enqueueNextJob?: boolean;
  allowDirectUploadedSeedImages?: boolean;
}

interface SpaceSeedPayload {
  sceneClusterId?: string;
  seedStrategy?: SceneSeedStrategy;
  directWorldInputImageIds?: string[];
}

export function createSpaceSeedHandler(
  options: SpaceSeedHandlerOptions
): GenerationJobHandler {
  const seedGenerator = options.seedGenerator ?? new OpenAISceneSeedGenerator();

  return async (job) => {
    const payload = parsePayload(job.payload);

    if (!payload.sceneClusterId) {
      throw new Error("Space seed job requires sceneClusterId.");
    }

    const sceneCluster = getSceneClusterRecord(payload.sceneClusterId, options.db);

    if (!sceneCluster) {
      throw new Error("Space seed job could not find scene cluster.");
    }

    if (
      sceneCluster.seedImageUrls.length > 0 &&
      (sceneCluster.status === "ready" || sceneCluster.status === "waiting_for_world")
    ) {
      return {
        sceneClusterId: sceneCluster.id,
        strategy: payload.seedStrategy ?? "generated-multiview",
        seedImageUrls: sceneCluster.seedImageUrls,
        reusedExistingSeeds: true
      } as JsonValue;
    }

    updateSceneClusterRecord(
      sceneCluster.id,
      {
        status: "generating_seed"
      },
      options.db
    );

    try {
      const imageIds = [
        ...new Set([
          ...sceneCluster.representativeImageIds,
          ...(payload.directWorldInputImageIds ?? [])
        ])
      ];
      const uploadedImages = getUploadedImagesByIds(
        sceneCluster.projectId,
        imageIds.length > 0 ? imageIds : sceneCluster.sourceImageIds,
        options.db
      );
      const plan = planSceneSeeds({
        cluster: {
          ...sceneCluster,
          seedStrategy: payload.seedStrategy ?? "generated-multiview",
          directWorldInputImageIds: payload.directWorldInputImageIds ?? []
        },
        uploadedImages,
        allowDirectUploadedSeedImages: options.allowDirectUploadedSeedImages
      });
      const representativeUrls = uploadedImages.map((image) => image.originalUrl);
      const generatedSeeds: GeneratedSeedImage[] = [];

      for (const plannedSeed of plan.seedImages) {
        if (plannedSeed.url) {
          generatedSeeds.push({
            view: plannedSeed.view,
            azimuth: plannedSeed.azimuth,
            url: plannedSeed.url,
            prompt: plannedSeed.prompt
          });
          continue;
        }

        generatedSeeds.push(
          await seedGenerator.generateSeed({
            projectId: job.projectId,
            sceneClusterId: sceneCluster.id,
            view: plannedSeed.view,
            prompt: plannedSeed.prompt,
            sourceImageUrls: representativeUrls
          })
        );
      }

      const seedImageUrls = generatedSeeds.map((seed) => seed.url);
      const persistAndEnqueue = options.db.transaction(() => {
        updateSceneClusterRecord(
          sceneCluster.id,
          {
            seedImageUrls,
            spatialPrompt: plan.worldPrompt,
            worldLabsOperationId: null,
            worldId: null,
            status: "waiting_for_world"
          },
          options.db
        );

        if (options.enqueueNextJob !== false) {
          createGenerationJob(
            {
              projectId: job.projectId,
              type: "worldlabs-generation",
              payload: {
                sceneClusterId: sceneCluster.id,
                inputMode: worldLabsInputModeForStrategy(plan.strategy),
                textPrompt: plan.worldPrompt,
                seedImages: generatedSeeds.map((seed) => ({
                  url: seed.url,
                  view: seed.view,
                  azimuth: seed.azimuth
                }))
              },
              priority: job.priority,
              maxAttempts: 1
            },
            options.db
          );
        }
      });
      persistAndEnqueue();

      return {
        sceneClusterId: sceneCluster.id,
        strategy: plan.strategy,
        seedImageUrls,
        seedImages: generatedSeeds.map((seed) => ({
          view: seed.view,
          azimuth: seed.azimuth,
          url: seed.url
        }))
      } as JsonValue;
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
  };
}

function worldLabsInputModeForStrategy(
  strategy: SceneSeedStrategy
): "multi-image" | "panorama" | "single-image" {
  if (strategy === "generated-panorama") {
    return "panorama";
  }

  return "multi-image";
}

function parsePayload(payload: JsonValue): SpaceSeedPayload {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, JsonValue>;
  return {
    sceneClusterId:
      typeof record.sceneClusterId === "string" ? record.sceneClusterId : undefined,
    seedStrategy: isSeedStrategy(record.seedStrategy)
      ? record.seedStrategy
      : undefined,
    directWorldInputImageIds: Array.isArray(record.directWorldInputImageIds)
      ? record.directWorldInputImageIds.filter(
          (imageId): imageId is string => typeof imageId === "string"
        )
      : undefined
  };
}

function isSeedStrategy(value: JsonValue): value is SceneSeedStrategy {
  return (
    value === "direct-multi-image" ||
    value === "generated-multiview" ||
    value === "generated-panorama"
  );
}

function isFinalJobAttempt(job: { attempts: number; maxAttempts: number }): boolean {
  return job.maxAttempts <= 1 || job.attempts >= job.maxAttempts;
}
