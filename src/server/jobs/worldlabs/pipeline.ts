import type { DatabaseClient } from "@/server/db";
import type { GenerationJobHandler } from "@/server/jobs/worker";
import type { GenerationJob } from "@/types";
import { createSceneClassificationHandler } from "../scene-classification";
import { createSpaceSeedHandler } from "../space-seeds";
import { createWorldLabsGenerationHandler } from "./handler";

export interface SpacePipelineHandlerOptions {
  db: DatabaseClient;
}

export function createSpacePipelineHandlers(
  options: SpacePipelineHandlerOptions
): Partial<Record<GenerationJob["type"], GenerationJobHandler>> {
  return {
    "scene-classification": createSceneClassificationHandler(options),
    "space-seed": createSpaceSeedHandler(options),
    "worldlabs-generation": createWorldLabsGenerationHandler(options)
  };
}
