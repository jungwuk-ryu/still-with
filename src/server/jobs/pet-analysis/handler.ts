import type { DatabaseClient } from "@/server/db";
import { getDatabase } from "@/server/db";
import { updateProjectSelectedPet } from "@/server/db";
import {
  createClarificationPetProfile,
  getProjectPetProfile,
  updateProjectLifecycle
} from "@/server/projects/repository";
import {
  enqueueMemoryGenerationJobs,
  updateProjectToStage
} from "@/server/projects/pipeline";
import { getLoadingStage, TOTAL_LOADING_STEPS } from "@/server/projects/stages";
import { createOpenAIProvider, type OpenAIProvider } from "@/server/providers";
import {
  createLocalStorageDriver,
  resolveProviderImageUrls,
  type StorageDriver
} from "@/server/storage";
import type { GenerationJob, JsonValue } from "@/types";
import { upsertPetProfileRecord } from "./pet-profile-repository";

export interface PetAnalysisJobPayload {
  imageUrls: string[];
  clarificationAnswer?: string;
}

export interface PetAnalysisHandlerDeps {
  db?: DatabaseClient;
  openAIProvider?: OpenAIProvider;
  storage?: StorageDriver;
}

export async function handlePetAnalysisJob(
  job: GenerationJob,
  deps: PetAnalysisHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const provider = deps.openAIProvider ?? createOpenAIProvider();
  const storage = deps.storage ?? createLocalStorageDriver();
  const payload = coercePayload(job.payload);
  const providerImageUrls = await resolveProviderImageUrls(
    payload.imageUrls,
    storage
  );
  const result = await provider.analyzePetIdentity({
    imageUrls: providerImageUrls,
    clarificationAnswer: payload.clarificationAnswer,
    context: {
      projectId: job.projectId
    }
  });

  if (result.clarificationRequired || !result.petProfile) {
    const existingProfile = getProjectPetProfile(job.projectId, db);
    if (!existingProfile) {
      createClarificationPetProfile(job.projectId, [], db);
    }

    const stage = getLoadingStage(1);
    updateProjectLifecycle(
      job.projectId,
      {
        status: "clarification_required",
        currentStage: stage.title,
        currentStepIndex: stage.index,
        totalSteps: TOTAL_LOADING_STEPS,
        debugProgressPercent: 20,
        selectedPetId: null
      },
      db
    );

    return {
      clarificationRequired: true,
      clarificationPrompt: result.clarificationPrompt,
      petProfileId: null,
      selectionConfidence: null
    };
  }

  const petProfile = upsertPetProfileRecord(result.petProfile, db);
  updateProjectSelectedPet(job.projectId, petProfile.id, db);
  enqueueMemoryGenerationJobs(job.projectId, petProfile, db);
  const stage = getLoadingStage(2);
  updateProjectToStage(
    job.projectId,
    {
      status: "preparing_space",
      currentStage: stage.title,
      currentStepIndex: stage.index,
      totalSteps: TOTAL_LOADING_STEPS,
      debugProgressPercent: 36,
      selectedPetId: petProfile.id,
      errorCode: null,
      errorMessage: null
    },
    db
  );

  return {
    clarificationRequired: false,
    clarificationPrompt: result.clarificationPrompt,
    petProfileId: petProfile.id,
    selectionConfidence: petProfile.selectionConfidence
  };
}

function coercePayload(payload: JsonValue): PetAnalysisJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("pet-analysis payload must be an object.");
  }

  const record = payload as Record<string, unknown>;
  const imageUrls = Array.isArray(record.imageUrls)
    ? record.imageUrls.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string"
      )
    : [];

  if (imageUrls.length === 0) {
    throw new Error("pet-analysis payload requires at least one image URL.");
  }

  return {
    imageUrls,
    clarificationAnswer:
      typeof record.clarificationAnswer === "string"
        ? record.clarificationAnswer
        : undefined
  };
}
