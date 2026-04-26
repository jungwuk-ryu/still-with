import type { DatabaseClient } from "@/server/db";
import { getDatabase } from "@/server/db";
import { updateProjectSelectedPet } from "@/server/db";
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

  if (result.petProfile) {
    upsertPetProfileRecord(result.petProfile, db);
    updateProjectSelectedPet(job.projectId, result.petProfile.id, db);
  }

  return {
    clarificationRequired: result.clarificationRequired,
    clarificationPrompt: result.clarificationPrompt,
    petProfileId: result.petProfile?.id ?? null,
    selectionConfidence: result.petProfile?.selectionConfidence ?? null
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
