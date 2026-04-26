import type { Project, ProjectStatus, UploadedImage } from "@/types";
import { getDatabase, type DatabaseClient } from "@/server/db";
import { getSelectedSceneClusterForProject } from "@/server/assets/world-assets";
import { SPACE_RECONSTRUCTION_PROMPT_VERSION } from "@/ai/scene";
import { getProjectBundle } from "./repository";
import {
  getDefaultStageIndexForStatus,
  getLoadingStage,
  getStageIndexForJobType,
  TOTAL_LOADING_STEPS
} from "./stages";

export interface PublicProjectImage {
  id: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
  uploadOrder: number;
}

export interface PublicLoadingStage {
  index: number;
  total: number;
  label: string;
  title: string;
  description: string;
}

export interface GentleRetryState {
  message: string;
  retryAfterSeconds: number | null;
}

export interface PublicSpacePreviewImage {
  id: string;
  url: string;
  label: string;
  order: number;
}

export interface PublicProjectStatus {
  projectId: string;
  status: ProjectStatus;
  stage: PublicLoadingStage;
  retry: GentleRetryState | null;
  nextRoute: string | null;
  canEnter: boolean;
  needsClarification: boolean;
  uploadedImages: PublicProjectImage[];
  spacePreviewImages: PublicSpacePreviewImage[];
  selectedPetId: string | null;
  updatedAt: string;
}

export interface PublicProjectStatusOptions {
  db?: DatabaseClient;
}

export function getPublicProjectStatus(
  projectId: string,
  options: PublicProjectStatusOptions = {}
): PublicProjectStatus | null {
  const db = options.db ?? getDatabase();
  const bundle = getProjectBundle(projectId, db);

  if (!bundle) {
    return null;
  }

  const retryingJob = bundle.retryingJobs[0] ?? null;
  const retryStageIndex = retryingJob
    ? getStageIndexForJobType(retryingJob.type)
    : null;
  const stageIndex = retryStageIndex ?? getVisibleStageIndex(bundle.project);
  const stage = getLoadingStage(stageIndex);

  return {
    projectId: bundle.project.id,
    status: bundle.project.status,
    stage: {
      index: stage.index,
      total: TOTAL_LOADING_STEPS,
      label: `Step ${stage.index + 1} of ${TOTAL_LOADING_STEPS}`,
      title: stage.title,
      description: stage.description
    },
    retry: retryingJob
      ? {
          message: retryMessage(retryingJob.runAfter),
          retryAfterSeconds: getRetryAfterSeconds(retryingJob.runAfter)
        }
      : bundle.project.retryCount > 0 && !isTerminalStatus(bundle.project.status)
        ? {
            message:
              "This is taking a little longer than expected. We'll keep trying quietly.",
            retryAfterSeconds: null
          }
        : null,
    nextRoute: getNextRoute(bundle.project),
    canEnter: bundle.project.status === "ready",
    needsClarification: bundle.project.status === "clarification_required",
    uploadedImages: bundle.uploadedImages.map(toPublicImage),
    spacePreviewImages: getSpacePreviewImages(bundle.project.id, db),
    selectedPetId: bundle.project.selectedPetId,
    updatedAt: bundle.project.updatedAt
  };
}

function getVisibleStageIndex(project: Project): number {
  if (project.currentStepIndex >= 0 && project.currentStepIndex < TOTAL_LOADING_STEPS) {
    return project.currentStepIndex;
  }

  return getDefaultStageIndexForStatus(project.status);
}

function getNextRoute(project: Project): string | null {
  if (project.status === "clarification_required") {
    return `/projects/${project.id}/clarify`;
  }

  if (project.status === "ready") {
    return `/projects/${project.id}/space`;
  }

  return null;
}

function isTerminalStatus(status: ProjectStatus): boolean {
  return status === "ready" || status === "failed" || status === "cancelled";
}

function toPublicImage(image: UploadedImage): PublicProjectImage {
  return {
    id: image.id,
    originalUrl: image.originalUrl,
    thumbnailUrl: image.thumbnailUrl,
    mimeType: image.mimeType,
    uploadOrder: image.uploadOrder
  };
}

function getSpacePreviewImages(
  projectId: string,
  db: DatabaseClient
): PublicSpacePreviewImage[] {
  const sceneCluster = getSelectedSceneClusterForProject(projectId, db);

  if (
    !sceneCluster ||
    sceneCluster.seedPromptVersion !== SPACE_RECONSTRUCTION_PROMPT_VERSION
  ) {
    return [];
  }

  return sceneCluster.seedImageUrls.map((url, index) => ({
    id: `${sceneCluster.id}-seed-${index}`,
    url,
    label: `Space reconstruction preview ${index + 1}`,
    order: index
  }));
}

function getRetryAfterSeconds(runAfter: string): number {
  return Math.max(1, Math.ceil((Date.parse(runAfter) - Date.now()) / 1_000));
}

function retryMessage(runAfter: string): string {
  const retryAfterSeconds = getRetryAfterSeconds(runAfter);

  if (retryAfterSeconds <= 1) {
    return "This is taking a little longer than expected. We'll keep trying quietly.";
  }

  return `This is taking a little longer than expected. We'll try again in about ${retryAfterSeconds} seconds.`;
}
