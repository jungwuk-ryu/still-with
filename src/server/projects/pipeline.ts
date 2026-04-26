import { REQUIRED_MOTION_KEYS } from "@/pet/motion-set";
import {
  REQUIRED_EXPERIENCE_AUDIO_ASSETS,
  listAudioAssetRecords
} from "@/server/audio";
import { createGenerationJob } from "@/server/jobs/repository";
import { listMotionClipRecords } from "@/server/motion";
import type { DatabaseClient } from "@/server/db";
import type { JsonValue, PetProfile, Project } from "@/types";
import {
  getLoadingStage,
  TOTAL_LOADING_STEPS
} from "./stages";
import {
  listUploadedImages,
  updateProjectLifecycle,
  type ProjectLifecycleUpdate
} from "./repository";
import { enqueueProjectCompletionEmailJob } from "./email-notifications";

const ACTIVE_JOB_STATUSES = ["queued", "retrying", "running", "succeeded"];

export function enqueuePetAnalysisJob(
  projectId: string,
  db: DatabaseClient,
  options: { clarificationAnswer?: string } = {}
): void {
  const uploadedImages = listUploadedImages(projectId, db);

  if (uploadedImages.length === 0) {
    throw new Error("Pet analysis requires at least one uploaded image.");
  }

  if (
    hasProjectJob(projectId, "pet-analysis", db, {
      clarificationAnswer: options.clarificationAnswer
    })
  ) {
    return;
  }

  createGenerationJob(
    {
      projectId,
      type: "pet-analysis",
      payload: {
        imageUrls: uploadedImages.map((image) => image.originalUrl),
        ...(options.clarificationAnswer
          ? { clarificationAnswer: options.clarificationAnswer }
          : {})
      },
      priority: 20
    },
    db
  );
}

export function enqueueMemoryGenerationJobs(
  projectId: string,
  petProfile: PetProfile,
  db: DatabaseClient
): void {
  const uploadedImages = listUploadedImages(projectId, db);
  const sourceImageUrls = uploadedImages.map((image) => image.originalUrl);

  if (!hasProjectJob(projectId, "scene-classification", db)) {
    createGenerationJob(
      {
        projectId,
        type: "scene-classification",
        priority: 10
      },
      db
    );
  }

  if (!hasProjectJob(projectId, "pet-keyframe", db)) {
    createGenerationJob(
      {
        projectId,
        type: "pet-keyframe",
        payload: {
          petProfile: petProfile as unknown as JsonValue,
          sourceImageUrls,
          motionKeys: [...REQUIRED_MOTION_KEYS]
        },
        priority: 8
      },
      db
    );
  }
}

export function enqueuePetVideoJob(
  projectId: string,
  petProfile: PetProfile,
  db: DatabaseClient
): void {
  if (hasProjectJob(projectId, "pet-video", db)) {
    return;
  }

  createGenerationJob(
    {
      projectId,
      type: "pet-video",
      payload: {
        petProfile: petProfile as unknown as JsonValue,
        motionKeys: [...REQUIRED_MOTION_KEYS]
      },
      priority: 7
    },
    db
  );
}

export function markProjectReadyIfAssetsComplete(
  projectId: string,
  db: DatabaseClient
): Project | null {
  const hasRenderableWorld = Boolean(
    db
      .prepare(
        `SELECT 1
         FROM world_assets
         WHERE project_id = ?
         LIMIT 1`
      )
      .get(projectId)
  );
  const project = db
    .prepare("SELECT selected_pet_id FROM projects WHERE id = ?")
    .get(projectId) as { selected_pet_id: string | null } | undefined;
  const selectedPetId = project?.selected_pet_id ?? null;

  if (!hasRenderableWorld || !selectedPetId) {
    return null;
  }

  const readyMotionKeys = new Set(
    listMotionClipRecords(projectId, db)
      .filter(
        (clip) => clip.petProfileId === selectedPetId && clip.status === "ready"
      )
      .map((clip) => clip.motionKey)
  );
  const hasRequiredMotion = REQUIRED_MOTION_KEYS.every((motionKey) =>
    readyMotionKeys.has(motionKey)
  );

  if (!hasRequiredMotion) {
    return null;
  }

  if (!hasRequiredAudioAssets(projectId, db)) {
    enqueueElevenLabsAudioJob(projectId, db);
    return null;
  }

  const stage = getLoadingStage(TOTAL_LOADING_STEPS - 1);
  const updatedProject = updateProjectLifecycle(
    projectId,
    {
      status: "ready",
      currentStage: stage.title,
      currentStepIndex: stage.index,
      totalSteps: TOTAL_LOADING_STEPS,
      debugProgressPercent: 100,
      errorCode: null,
      errorMessage: null,
      completedAt: new Date().toISOString()
    },
    db
  );

  if (updatedProject) {
    enqueueProjectCompletionEmailJob(projectId, db);
  }

  return updatedProject;
}

export function enqueueElevenLabsAudioJob(
  projectId: string,
  db: DatabaseClient
): void {
  if (hasProjectJob(projectId, "elevenlabs-audio", db)) {
    return;
  }

  createGenerationJob(
    {
      projectId,
      type: "elevenlabs-audio",
      priority: 6,
      maxAttempts: 2
    },
    db
  );
}

export function updateProjectToStage(
  projectId: string,
  input: ProjectLifecycleUpdate,
  db: DatabaseClient
): Project | null {
  return updateProjectLifecycle(projectId, input, db);
}

function hasRequiredAudioAssets(projectId: string, db: DatabaseClient): boolean {
  const terminalAssets = new Set(
    listAudioAssetRecords(projectId, db)
      .filter((asset) => asset.status === "ready" || asset.status === "skipped")
      .map((asset) => `${asset.kind}:${asset.assetKey}`)
  );

  return REQUIRED_EXPERIENCE_AUDIO_ASSETS.every((asset) =>
    terminalAssets.has(`${asset.kind}:${asset.assetKey}`)
  );
}

function hasProjectJob(
  projectId: string,
  type: string,
  db: DatabaseClient,
  payloadSubset?: Record<string, unknown>
): boolean {
  const rows = db
    .prepare(
      `SELECT payload_json
       FROM generation_jobs
       WHERE project_id = ?
         AND type = ?
         AND status IN (${ACTIVE_JOB_STATUSES.map(() => "?").join(", ")})
       LIMIT 20`
    )
    .all(projectId, type, ...ACTIVE_JOB_STATUSES) as Array<{
      payload_json: string;
    }>;

  if (!payloadSubset) {
    return rows.length > 0;
  }

  return rows.some((row) => {
    const payload = parsePayload(row.payload_json);
    return Object.entries(payloadSubset).every(
      ([key, value]) => payload[key] === value
    );
  });
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
