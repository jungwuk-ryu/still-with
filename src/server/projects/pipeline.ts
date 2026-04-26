import { REQUIRED_MOTION_KEYS } from "@/pet/motion-set";
import { SPACE_RECONSTRUCTION_PROMPT_VERSION } from "@/ai/scene";
import {
  getSelectedSceneClusterForProject,
  listSceneClusterRecordsForProject,
  listWorldAssetRecordsForProject
} from "@/server/assets/world-assets";
import {
  REQUIRED_EXPERIENCE_AUDIO_ASSETS,
  getSceneAudioAssetKey,
  listAudioAssetRecords
} from "@/server/audio";
import { getElevenLabsApiKey } from "@/lib/env";
import { createGenerationJob } from "@/server/jobs/repository";
import { listMotionClipRecords } from "@/server/motion";
import type { GenerationJobStatus } from "@/types";
import { getDatabase, type DatabaseClient } from "@/server/db";
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

const ACTIVE_JOB_STATUSES: GenerationJobStatus[] = [
  "queued",
  "retrying",
  "running",
  "succeeded"
];
const IN_FLIGHT_JOB_STATUSES: GenerationJobStatus[] = [
  "queued",
  "retrying",
  "running"
];
export const MAX_BACKGROUND_SPACE_COUNT = 2;

export type ExperienceAudioBackfillStatus = "ready" | "queued" | "unavailable";

export function enqueueSpacePreviewJob(
  projectId: string,
  db: DatabaseClient
): void {
  enqueueSceneClassificationJob(projectId, db, {
    backgroundPreview: true,
    priority: 24,
    maxAttempts: 1
  });
}

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

  if (!hasPreparedOrInFlightSpacePreview(projectId, db)) {
    enqueueSceneClassificationJob(projectId, db, {
      priority: 10
    });
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

function enqueueSceneClassificationJob(
  projectId: string,
  db: DatabaseClient,
  options: {
    backgroundPreview?: boolean;
    backgroundSpaces?: boolean;
    priority: number;
    maxAttempts?: number;
  }
): void {
  if (
    hasProjectJob(projectId, "scene-classification", db, undefined, {
      statuses: IN_FLIGHT_JOB_STATUSES
    })
  ) {
    return;
  }

  createGenerationJob(
    {
      projectId,
      type: "scene-classification",
      payload: {
        ...(options.backgroundPreview ? { backgroundPreview: true } : {}),
        ...(options.backgroundSpaces ? { backgroundSpaces: true } : {})
      },
      priority: options.priority,
      maxAttempts: options.maxAttempts
    },
    db
  );
}

export function ensureBackgroundSpaceGeneration(
  projectId: string,
  db: DatabaseClient = getDatabase()
): void {
  const primarySceneClusterId = getPrimarySceneClusterId(projectId, db);

  if (!primarySceneClusterId) {
    return;
  }

  const clusters = listSceneClusterRecordsForProject(projectId, db);
  const alternatives = clusters
    .filter((cluster) => cluster.id !== primarySceneClusterId)
    .slice(0, MAX_BACKGROUND_SPACE_COUNT);

  if (
    alternatives.length < MAX_BACKGROUND_SPACE_COUNT &&
    !hasProjectJob(
      projectId,
      "scene-classification",
      db,
      { backgroundSpaces: true }
    )
  ) {
    enqueueSceneClassificationJob(projectId, db, {
      backgroundSpaces: true,
      priority: 4,
      maxAttempts: 1
    });
  }

  for (const cluster of alternatives) {
    if (
      cluster.status === "ready" ||
      cluster.status === "generating_seed" ||
      cluster.status === "waiting_for_world"
    ) {
      continue;
    }

    if (
      hasProjectJob(
        projectId,
        "space-seed",
        db,
        { sceneClusterId: cluster.id },
        {
          statuses: IN_FLIGHT_JOB_STATUSES
        }
      ) ||
      hasProjectJob(
        projectId,
        "worldlabs-generation",
        db,
        {
          sceneClusterId: cluster.id
        },
        {
          statuses: IN_FLIGHT_JOB_STATUSES
        }
      )
    ) {
      continue;
    }

    createGenerationJob(
      {
        projectId,
        type: "space-seed",
        payload: {
          sceneClusterId: cluster.id,
          backgroundSpace: true
        },
        priority: 3,
        maxAttempts: 1
      },
      db
    );
  }
}

function hasPreparedOrInFlightSpacePreview(
  projectId: string,
  db: DatabaseClient
): boolean {
  if (
    hasProjectJob(projectId, "scene-classification", db, undefined, {
      statuses: IN_FLIGHT_JOB_STATUSES
    }) ||
    hasProjectJob(projectId, "space-seed", db, undefined, {
      statuses: IN_FLIGHT_JOB_STATUSES
    }) ||
    hasProjectJob(projectId, "worldlabs-generation", db, undefined, {
      statuses: IN_FLIGHT_JOB_STATUSES
    })
  ) {
    return true;
  }

  const sceneCluster = getSelectedSceneClusterForProject(projectId, db);

  if (!sceneCluster) {
    return false;
  }

  if (
    sceneCluster.seedImageUrls.length > 0 &&
    sceneCluster.seedPromptVersion === SPACE_RECONSTRUCTION_PROMPT_VERSION &&
    sceneCluster.status !== "failed"
  ) {
    return true;
  }

  return (
    sceneCluster.status === "generating_seed" ||
    sceneCluster.status === "waiting_for_world" ||
    sceneCluster.status === "ready"
  );
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
  const primarySceneClusterId = getPrimarySceneClusterId(projectId, db);
  const hasRenderableWorld = Boolean(primarySceneClusterId);
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

  if (!hasTerminalExperienceAudioAssets(projectId, db, primarySceneClusterId)) {
    enqueueElevenLabsAudioJob(projectId, db, {
      sceneClusterId: primarySceneClusterId
    });
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
  db: DatabaseClient,
  options: { statuses?: GenerationJobStatus[]; sceneClusterId?: string | null } = {}
): void {
  const payloadSubset = options.sceneClusterId
    ? { sceneClusterId: options.sceneClusterId }
    : undefined;

  if (
    hasProjectJob(projectId, "elevenlabs-audio", db, payloadSubset, {
      statuses: options.statuses
    })
  ) {
    return;
  }

  createGenerationJob(
    {
      projectId,
      type: "elevenlabs-audio",
      payload: options.sceneClusterId
        ? {
            sceneClusterId: options.sceneClusterId
          }
        : {},
      priority: 6,
      maxAttempts: 2
    },
    db
  );
}

export function ensureExperienceAudioBackfill(
  projectId: string,
  db: DatabaseClient = getDatabase(),
  options: { sceneClusterId?: string | null } = {}
): ExperienceAudioBackfillStatus {
  const sceneClusterId = options.sceneClusterId ?? getPrimarySceneClusterId(projectId, db);
  const payloadSubset = sceneClusterId ? { sceneClusterId } : undefined;

  if (
    sceneClusterId &&
    !listSceneClusterRecordsForProject(projectId, db).some(
      (cluster) => cluster.id === sceneClusterId
    )
  ) {
    return "unavailable";
  }

  if (hasReadyExperienceAudioAssets(projectId, db, sceneClusterId)) {
    return "ready";
  }

  if (!getElevenLabsApiKey()) {
    return "unavailable";
  }

  if (hasProjectJob(projectId, "elevenlabs-audio", db, payloadSubset, {
    statuses: IN_FLIGHT_JOB_STATUSES
  })) {
    return "queued";
  }

  if (
    hasTerminalExperienceAudioAssets(projectId, db, sceneClusterId) &&
    !hasMissingApiKeySkippedAudio(projectId, db, sceneClusterId)
  ) {
    return "unavailable";
  }

  enqueueElevenLabsAudioJob(projectId, db, {
    statuses: IN_FLIGHT_JOB_STATUSES,
    sceneClusterId
  });
  return "queued";
}

export function updateProjectToStage(
  projectId: string,
  input: ProjectLifecycleUpdate,
  db: DatabaseClient
): Project | null {
  return updateProjectLifecycle(projectId, input, db);
}

export function hasReadyExperienceAudioAssets(
  projectId: string,
  db: DatabaseClient,
  sceneClusterId?: string | null
): boolean {
  const requiredKeys = getRequiredAudioAssetKeyCandidates(sceneClusterId);
  const readyAssets = new Set(
    listAudioAssetRecords(projectId, db)
      .filter((asset) => asset.status === "ready" && asset.audioUrl)
      .map((asset) => `${asset.kind}:${asset.assetKey}`)
  );

  return requiredKeys.every((asset) =>
    asset.assetKeys.some((assetKey) => readyAssets.has(`${asset.kind}:${assetKey}`))
  );
}

function hasTerminalExperienceAudioAssets(
  projectId: string,
  db: DatabaseClient,
  sceneClusterId?: string | null
): boolean {
  const requiredKeys = getRequiredAudioAssetKeyCandidates(sceneClusterId);
  const terminalAssets = new Set(
    listAudioAssetRecords(projectId, db)
      .filter((asset) => asset.status === "ready" || asset.status === "skipped")
      .map((asset) => `${asset.kind}:${asset.assetKey}`)
  );

  return requiredKeys.every((asset) =>
    asset.assetKeys.some((assetKey) =>
      terminalAssets.has(`${asset.kind}:${assetKey}`)
    )
  );
}

function hasMissingApiKeySkippedAudio(
  projectId: string,
  db: DatabaseClient,
  sceneClusterId?: string | null
): boolean {
  const requiredKeys = new Set(
    getRequiredAudioAssetKeyCandidates(sceneClusterId).flatMap((asset) =>
      asset.assetKeys.map((assetKey) => `${asset.kind}:${assetKey}`)
    )
  );

  return listAudioAssetRecords(projectId, db).some(
    (asset) =>
      asset.status === "skipped" &&
      requiredKeys.has(`${asset.kind}:${asset.assetKey}`) &&
      asset.providerErrorMessage?.includes("ELEVENLABS_API_KEY")
  );
}

function getRequiredAudioAssetKeyCandidates(
  sceneClusterId?: string | null
): Array<{
  kind: (typeof REQUIRED_EXPERIENCE_AUDIO_ASSETS)[number]["kind"];
  assetKeys: string[];
}> {
  return REQUIRED_EXPERIENCE_AUDIO_ASSETS.map((asset) => ({
    kind: asset.kind,
    assetKeys: sceneClusterId
      ? [getSceneAudioAssetKey(sceneClusterId, asset.assetKey), asset.assetKey]
      : [asset.assetKey]
  }));
}

function getPrimarySceneClusterId(
  projectId: string,
  db: DatabaseClient
): string | null {
  return listWorldAssetRecordsForProject(projectId, db)[0]?.sceneClusterId ?? null;
}

function hasProjectJob(
  projectId: string,
  type: string,
  db: DatabaseClient,
  payloadSubset?: Record<string, unknown>,
  options: { statuses?: GenerationJobStatus[] } = {}
): boolean {
  const statuses = options.statuses ?? ACTIVE_JOB_STATUSES;
  const rows = db
    .prepare(
      `SELECT payload_json
       FROM generation_jobs
       WHERE project_id = ?
         AND type = ?
         AND status IN (${statuses.map(() => "?").join(", ")})
       LIMIT 20`
    )
    .all(projectId, type, ...statuses) as Array<{
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
