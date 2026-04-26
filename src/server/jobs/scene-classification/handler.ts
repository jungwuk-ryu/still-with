import { OpenAISceneClassifier, type SceneClassifier } from "@/ai/scene";
import { createGenerationJob } from "@/server/jobs/repository";
import type { GenerationJobHandler } from "@/server/jobs/worker";
import { updateProjectStatus, type DatabaseClient } from "@/server/db";
import {
  createSceneClusterRecord,
  getSelectedSceneClusterForProject,
  listUploadedImagesForProject,
  updateSceneClusterRecord
} from "@/server/assets/world-assets";
import type { JsonValue } from "@/types";

export interface SceneClassificationHandlerOptions {
  db: DatabaseClient;
  classifier?: SceneClassifier;
  enqueueNextJob?: boolean;
}

export function createSceneClassificationHandler(
  options: SceneClassificationHandlerOptions
): GenerationJobHandler {
  const classifier = options.classifier ?? new OpenAISceneClassifier();

  return async (job) => {
    const uploadedImages = listUploadedImagesForProject(job.projectId, options.db);

    if (uploadedImages.length === 0) {
      throw new Error("Scene classification requires at least one uploaded image.");
    }

    updateProjectStatus(job.projectId, "preparing_space", options.db);

    try {
      const existingCluster = getSelectedSceneClusterForProject(job.projectId, options.db);

      if (
        existingCluster &&
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
        const sceneCluster = existingCluster
          ? updateSceneClusterRecord(
              existingCluster.id,
              {
                label: primary.label,
              sourceImageIds: primary.sourceImageIds,
              representativeImageIds: primary.representativeImageIds,
              spatialPrompt: primary.spatialPrompt,
              seedImageUrls: [],
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

        if (options.enqueueNextJob !== false) {
          createGenerationJob(
            {
              projectId: job.projectId,
              type: "space-seed",
              payload: {
                sceneClusterId: sceneCluster.id,
                seedStrategy: primary.seedStrategy,
                directWorldInputImageIds: primary.directWorldInputImageIds
              },
              priority: job.priority
            },
            options.db
          );
        }

        return sceneCluster;
      });
      const sceneCluster = persistAndEnqueue();

      return {
        sceneClusterId: sceneCluster.id,
        label: sceneCluster.label,
        representativeImageIds: sceneCluster.representativeImageIds,
        seedStrategy: primary.seedStrategy,
        confidence: primary.confidence
      } as JsonValue;
    } catch (error) {
      if (isFinalJobAttempt(job)) {
        updateProjectStatus(job.projectId, "failed", options.db);
      }

      throw error;
    }
  };
}

function isFinalJobAttempt(job: { attempts: number; maxAttempts: number }): boolean {
  return job.maxAttempts <= 1 || job.attempts >= job.maxAttempts;
}
