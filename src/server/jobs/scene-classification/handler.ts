import {
  OpenAISceneClassifier,
  type ClassifiedSceneCluster,
  type SceneClassifier
} from "@/ai/scene";
import { createGenerationJob } from "@/server/jobs/repository";
import type { GenerationJobHandler } from "@/server/jobs/worker";
import { updateProjectStatus, type DatabaseClient } from "@/server/db";
import {
  createSceneClusterRecord,
  getSelectedSceneClusterForProject,
  listSceneClusterRecordsForProject,
  listUploadedImagesForProject,
  updateSceneClusterRecord
} from "@/server/assets/world-assets";
import { MAX_BACKGROUND_SPACE_COUNT } from "@/server/projects/pipeline";
import type { SceneCluster } from "@/types";
import type { JsonValue } from "@/types";

export interface SceneClassificationHandlerOptions {
  db: DatabaseClient;
  classifier?: SceneClassifier;
  enqueueNextJob?: boolean;
}

interface SceneClassificationPayload {
  backgroundPreview: boolean;
  backgroundSpaces: boolean;
}

export function createSceneClassificationHandler(
  options: SceneClassificationHandlerOptions
): GenerationJobHandler {
  const classifier = options.classifier ?? new OpenAISceneClassifier();

  return async (job) => {
    const payload = parsePayload(job.payload);
    const uploadedImages = listUploadedImagesForProject(job.projectId, options.db);

    if (uploadedImages.length === 0) {
      throw new Error("Scene classification requires at least one uploaded image.");
    }

    if (!payload.backgroundPreview && !payload.backgroundSpaces) {
      updateProjectStatus(job.projectId, "preparing_space", options.db);
    }

    try {
      const existingCluster = getSelectedSceneClusterForProject(job.projectId, options.db);

      if (
        existingCluster &&
        !payload.backgroundSpaces &&
        (existingCluster.status === "generating_seed" ||
          existingCluster.status === "waiting_for_world" ||
          existingCluster.status === "ready")
      ) {
        return {
          sceneClusterId: existingCluster.id,
          label: existingCluster.label,
          representativeImageIds: existingCluster.representativeImageIds,
          reusedExistingCluster: true
        } as JsonValue;
      }

      const classification = await classifier.classify({
        projectId: job.projectId,
        images: uploadedImages
      });
      const primary = classification.primaryCluster;
      const persistAndEnqueue = options.db.transaction(() => {
        if (payload.backgroundSpaces) {
          const alternatives = persistAlternativeSceneClusters({
            projectId: job.projectId,
            clusters: classification.clusters,
            existingPrimaryCluster: existingCluster,
            db: options.db
          });

          if (options.enqueueNextJob !== false) {
            for (const sceneCluster of alternatives) {
              createGenerationJob(
                {
                  projectId: job.projectId,
                  type: "space-seed",
                  payload: {
                    sceneClusterId: sceneCluster.id,
                    backgroundSpace: true
                  },
                  priority: Math.min(job.priority, 3),
                  maxAttempts: 1
                },
                options.db
              );
            }
          }

          return alternatives[0] ?? existingCluster;
        }

        const sceneCluster = existingCluster
          ? updateSceneClusterRecord(
              existingCluster.id,
              {
                label: primary.label,
                sourceImageIds: primary.sourceImageIds,
                representativeImageIds: primary.representativeImageIds,
                spatialPrompt: primary.spatialPrompt,
                seedImageUrls: [],
                seedPromptVersion: null,
                worldLabsOperationId: null,
                worldId: null,
                status: "selected"
              },
              options.db
            )
          : createSceneClusterRecord(
              {
                projectId: job.projectId,
                label: primary.label,
                sourceImageIds: primary.sourceImageIds,
                representativeImageIds: primary.representativeImageIds,
                spatialPrompt: primary.spatialPrompt,
                status: "selected"
              },
              options.db
            );

        if (!sceneCluster) {
          throw new Error("Failed to persist scene cluster.");
        }

        persistAlternativeSceneClusters({
          projectId: job.projectId,
          clusters: classification.clusters,
          existingPrimaryCluster: sceneCluster,
          db: options.db
        });

        if (options.enqueueNextJob !== false) {
          createGenerationJob(
            {
              projectId: job.projectId,
              type: "space-seed",
              payload: {
                sceneClusterId: sceneCluster.id,
                seedStrategy: primary.seedStrategy,
                directWorldInputImageIds: primary.directWorldInputImageIds,
                backgroundPreview: payload.backgroundPreview
              },
              priority: payload.backgroundPreview
                ? Math.max(job.priority - 1, 0)
                : job.priority,
              maxAttempts: 1
            },
            options.db
          );
        }

        return sceneCluster;
      });
      const sceneCluster = persistAndEnqueue();

      if (!sceneCluster) {
        return {
          sceneClusterId: existingCluster?.id ?? null,
          backgroundSpaces: payload.backgroundSpaces,
          createdAlternatives: 0
        } as JsonValue;
      }

      return {
        sceneClusterId: sceneCluster.id,
        label: sceneCluster.label,
        representativeImageIds: sceneCluster.representativeImageIds,
        seedStrategy: primary.seedStrategy,
        confidence: primary.confidence
      } as JsonValue;
    } catch (error) {
      if (
        isFinalJobAttempt(job) &&
        !payload.backgroundPreview &&
        !payload.backgroundSpaces
      ) {
        updateProjectStatus(job.projectId, "failed", options.db);
      }

      throw error;
    }
  };
}

function parsePayload(payload: JsonValue): SceneClassificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      backgroundPreview: false,
      backgroundSpaces: false
    };
  }

  const record = payload as Record<string, JsonValue>;

  return {
    backgroundPreview: record.backgroundPreview === true,
    backgroundSpaces: record.backgroundSpaces === true
  };
}

function persistAlternativeSceneClusters(input: {
  projectId: string;
  clusters: ClassifiedSceneCluster[];
  existingPrimaryCluster: SceneCluster | null;
  db: DatabaseClient;
}): SceneCluster[] {
  const existingClusters = listSceneClusterRecordsForProject(
    input.projectId,
    input.db
  );
  const existingSignatures = new Set(existingClusters.map(getSceneClusterSignature));
  const primarySignature = input.existingPrimaryCluster
    ? getSceneClusterSignature(input.existingPrimaryCluster)
    : null;
  const existingAlternativeCount = primarySignature
    ? existingClusters.filter(
        (cluster) => getSceneClusterSignature(cluster) !== primarySignature
      ).length
    : existingClusters.length;
  const remainingAlternativeSlots = Math.max(
    0,
    MAX_BACKGROUND_SPACE_COUNT - existingAlternativeCount
  );
  const alternatives: SceneCluster[] = [];

  for (const cluster of input.clusters) {
    if (alternatives.length >= remainingAlternativeSlots) {
      break;
    }

    const signature = getClassifiedSceneClusterSignature(cluster);

    if (
      !signature ||
      signature === primarySignature ||
      existingSignatures.has(signature)
    ) {
      continue;
    }

    const sceneCluster = createSceneClusterRecord(
      {
        projectId: input.projectId,
        label: cluster.label,
        sourceImageIds: cluster.sourceImageIds,
        representativeImageIds: cluster.representativeImageIds,
        spatialPrompt: cluster.spatialPrompt,
        status: "pending"
      },
      input.db
    );

    alternatives.push(sceneCluster);
    existingSignatures.add(signature);
  }

  return alternatives;
}

function getSceneClusterSignature(cluster: SceneCluster): string {
  return `${cluster.label.toLowerCase()}:${[...cluster.sourceImageIds]
    .sort()
    .join(",")}`;
}

function getClassifiedSceneClusterSignature(
  cluster: ClassifiedSceneCluster
): string | null {
  if (cluster.sourceImageIds.length === 0) {
    return null;
  }

  return `${cluster.label.toLowerCase()}:${[...cluster.sourceImageIds]
    .sort()
    .join(",")}`;
}

function isFinalJobAttempt(job: { attempts: number; maxAttempts: number }): boolean {
  return job.maxAttempts <= 1 || job.attempts >= job.maxAttempts;
}
