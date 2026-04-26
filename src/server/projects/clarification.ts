import type { Project } from "@/types";
import { getDatabase, getProjectRecord, type DatabaseClient } from "@/server/db";
import {
  confirmPetProfileWithClarification,
  updateProjectLifecycle
} from "./repository";
import { getLoadingStage } from "./stages";

const MAX_CLARIFICATION_LENGTH = 280;

export class ClarificationValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "ClarificationValidationError";
  }
}

export function submitProjectClarification(
  projectId: string,
  visualDetail: string,
  db: DatabaseClient = getDatabase()
): Project {
  const normalizedDetail = visualDetail.trim().replace(/\s+/g, " ");

  if (normalizedDetail.length < 3) {
    throw new ClarificationValidationError(
      "Share one visual detail so we know who to hold in focus."
    );
  }

  if (normalizedDetail.length > MAX_CLARIFICATION_LENGTH) {
    throw new ClarificationValidationError(
      "Keep the visual detail under 280 characters."
    );
  }

  const project = getProjectRecord(projectId, db);

  if (!project) {
    throw new ClarificationValidationError("Project not found.", 404);
  }

  if (project.status !== "clarification_required") {
    throw new ClarificationValidationError(
      "This memory is no longer waiting for that detail.",
      409
    );
  }

  const profile = confirmPetProfileWithClarification(
    projectId,
    normalizedDetail,
    db
  );

  if (!profile) {
    throw new ClarificationValidationError("Project not found.", 404);
  }

  const stage = getLoadingStage(2);
  const updatedProject = updateProjectLifecycle(
    projectId,
    {
      status: "preparing_space",
      currentStage: stage.title,
      currentStepIndex: stage.index,
      debugProgressPercent: 36,
      selectedPetId: profile.id,
      errorCode: null,
      errorMessage: null
    },
    db
  );

  if (!updatedProject) {
    throw new ClarificationValidationError("Project not found.", 404);
  }

  return updatedProject;
}
