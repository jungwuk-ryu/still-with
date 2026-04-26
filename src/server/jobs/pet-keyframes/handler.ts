import type { DatabaseClient } from "@/server/db";
import { getDatabase, getProjectRecord } from "@/server/db";
import { createOpenAIProvider, type OpenAIProvider } from "@/server/providers";
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
import { buildPetKeyframePrompt, chooseChromaKeyColor } from "@/ai/pet";
import { upsertMotionClipRecord } from "@/server/motion";
import type { GenerationJob, JsonValue, PetProfile } from "@/types";
import { getPetProfileRecord } from "@/server/jobs/pet-analysis/pet-profile-repository";

export interface PetKeyframeJobPayload {
  petProfile: PetProfile;
  motionKeys?: string[];
  sourceImageUrls?: string[];
}

export interface PetKeyframeHandlerDeps {
  db?: DatabaseClient;
  storage?: StorageDriver;
  openAIProvider?: OpenAIProvider;
}

export async function handlePetKeyframeJob(
  job: GenerationJob,
  deps: PetKeyframeHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const storage = deps.storage ?? createLocalStorageDriver();
  const provider = deps.openAIProvider ?? createOpenAIProvider();
  const payload = coercePayload(job.payload);
  const petProfile = resolveJobPetProfile(job.projectId, payload.petProfile, db);
  const sourceImageUrls = await resolveProviderImageUrls(
    payload.sourceImageUrls ?? [],
    storage
  );
  const motionKeys = normalizeMotionKeys(payload.motionKeys);
  const keyframes: Record<string, string[]> = {};

  for (const motionKey of motionKeys) {
    const definition = PET_MOTION_DEFINITIONS[motionKey];
    const prompt = buildPetKeyframePrompt({
      petProfile,
      motionKey,
      chromaKeyColor: chooseChromaKeyColor(petProfile)
    });
    const result = await provider.generateImageSeed({
      prompt,
      sourceImageUrls,
      size: "1280x720",
      quality: "medium",
      context: {
        projectId: job.projectId
      }
    });
    const imageUrls = await persistGeneratedImages({
      projectId: job.projectId,
      motionKey,
      imageUrls: result.imageUrls,
      storage
    });

    keyframes[motionKey] = imageUrls;
    upsertMotionClipRecord(
      {
        projectId: job.projectId,
        petProfileId: petProfile.id,
        motionKey,
        fromState: definition.fromState,
        toState: definition.toState,
        prompt,
        keyframeImageUrls: imageUrls,
        durationMs: definition.durationMs,
        loopable: definition.loopable,
        status: "generating_video"
      },
      db
    );
  }

  return {
    petProfileId: petProfile.id,
    keyframes
  };
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
      throw new Error("Pet job payload does not match the selected pet.");
    }
    return selectedProfile;
  }

  throw new Error("Pet keyframe job requires a persisted selected pet.");
}

async function persistGeneratedImages(input: {
  projectId: string;
  motionKey: PetMotionKey;
  imageUrls: string[];
  storage: StorageDriver;
}): Promise<string[]> {
  const persisted: string[] = [];

  for (let index = 0; index < input.imageUrls.length; index += 1) {
    const imageUrl = input.imageUrls[index];
    const dataUrl = parseDataUrl(imageUrl);

    if (!dataUrl) {
      persisted.push(imageUrl);
      continue;
    }

    const stored = await input.storage.putObject({
      key: `projects/${input.projectId}/pet/keyframes/${input.motionKey}-${index}.png`,
      body: dataUrl.body,
      contentType: dataUrl.contentType
    });
    persisted.push(stored.url);
  }

  return persisted;
}

function parseDataUrl(
  value: string
): { contentType: string; body: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(value);

  if (!match) {
    return null;
  }

  return {
    contentType: match[1],
    body: Buffer.from(match[2], "base64")
  };
}

function normalizeMotionKeys(motionKeys: string[] | undefined): PetMotionKey[] {
  const normalized = uniquePetMotionKeys(motionKeys);
  return normalized.length > 0 ? normalized : [...REQUIRED_MOTION_KEYS];
}

function coercePayload(payload: JsonValue): PetKeyframeJobPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("pet-keyframe payload must be an object.");
  }

  const record = payload as Record<string, unknown>;

  if (!record.petProfile || typeof record.petProfile !== "object") {
    throw new Error("pet-keyframe payload requires petProfile.");
  }

  return {
    petProfile: record.petProfile as PetProfile,
    motionKeys: Array.isArray(record.motionKeys)
      ? record.motionKeys.filter(
          (motionKey): motionKey is string => typeof motionKey === "string"
        )
      : undefined,
    sourceImageUrls: Array.isArray(record.sourceImageUrls)
      ? record.sourceImageUrls.filter(
          (imageUrl): imageUrl is string => typeof imageUrl === "string"
        )
      : undefined
  };
}
