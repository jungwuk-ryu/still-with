import { createOpenAIProvider } from "@/server/providers/openai";
import { loadProviderImage } from "@/server/providers/image-inputs";
import { createLocalStorageDriver } from "@/server/storage";
import {
  DREAM_FRAGMENT_PROMPT,
  claimDreamFragmentsForGeneration,
  markDreamFragmentFailed,
  markDreamFragmentReady
} from "@/server/projects/dream-fragments";
import type { GenerationJobHandler } from "@/server/jobs/worker";
import type { DatabaseClient } from "@/server/db";
import type { JsonValue } from "@/types";

interface DreamFragmentPayload {
  sceneClusterId?: string;
}

export function createDreamFragmentHandler(options: {
  db: DatabaseClient;
}): GenerationJobHandler {
  return async (job) => {
    const payload = parsePayload(job.payload);

    if (!payload.sceneClusterId) {
      throw new Error("Dream fragment job requires sceneClusterId.");
    }

    const fragments = claimDreamFragmentsForGeneration(
      job.projectId,
      payload.sceneClusterId,
      options.db
    );

    if (fragments.length === 0) {
      return { generated: 0, failed: 0 } as JsonValue;
    }

    const provider = createOpenAIProvider({ imageModel: "gpt-image-2" });
    const storage = createLocalStorageDriver();
    let generated = 0;
    let failed = 0;

    for (const fragment of fragments) {
      try {
        console.info("[dream-fragment] generation started", {
          jobId: job.id,
          projectId: job.projectId,
          sceneClusterId: payload.sceneClusterId,
          fragmentId: fragment.id,
          sourceImageId: fragment.sourceImageId
        });
        const result = await provider.generateImageSeed({
          prompt: DREAM_FRAGMENT_PROMPT,
          sourceImageUrls: [fragment.sourceImageUrl],
          size: "1024x1024",
          quality: "high",
          context: {
            projectId: job.projectId,
            sceneClusterId: payload.sceneClusterId
          }
        });
        const generatedUrl = result.imageUrls[0];

        if (!generatedUrl) {
          throw new Error("Dream fragment generation returned no image.");
        }

        const generatedImage = await loadProviderImage(generatedUrl, {
          projectId: job.projectId,
          storage
        });
        const stored = await storage.putObject({
          key: `projects/${job.projectId}/dream-fragments/${payload.sceneClusterId}/${fragment.id}.png`,
          body: generatedImage.body,
          contentType: generatedImage.contentType
        });
        markDreamFragmentReady(fragment.id, stored.url, options.db);
        generated += 1;
        console.info("[dream-fragment] generation completed", {
          jobId: job.id,
          projectId: job.projectId,
          sceneClusterId: payload.sceneClusterId,
          fragmentId: fragment.id
        });
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "Dream fragment generation failed.";
        markDreamFragmentFailed(fragment.id, message, options.db);
        console.error("[dream-fragment] generation failed", {
          jobId: job.id,
          projectId: job.projectId,
          sceneClusterId: payload.sceneClusterId,
          fragmentId: fragment.id,
          error: message
        });
      }
    }

    if (generated === 0 && failed > 0) {
      throw new Error("Dream fragment generation failed for every source image.");
    }

    return { generated, failed } as JsonValue;
  };
}

function parsePayload(payload: JsonValue): DreamFragmentPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, JsonValue>;
  return {
    sceneClusterId:
      typeof record.sceneClusterId === "string" ? record.sceneClusterId : undefined
  };
}
