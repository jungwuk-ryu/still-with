import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Project, UploadedImage } from "@/types";
import { getDatabase, type DatabaseClient } from "@/server/db";
import { createLocalStorageDriver, type StorageDriver } from "@/server/storage";
import {
  addUploadedImages,
  createIntakeProjectRecord,
  updateProjectLifecycle
} from "./repository";
import { enqueuePetAnalysisJob, enqueueSpacePreviewJob } from "./pipeline";
import {
  NO_PET_UPLOAD_MESSAGE,
  PET_PRESENCE_CHECK_UNAVAILABLE_MESSAGE,
  type PetPresenceDetector
} from "./pet-presence";
import { getLoadingStage, TOTAL_LOADING_STEPS } from "./stages";

export const MIN_RECOMMENDED_IMAGE_COUNT = 3;
export const MAX_PROJECT_IMAGE_COUNT = 12;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PROJECT_DISPLAY_NAME_LENGTH = 80;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
] as const;

export type AcceptedImageMimeType = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

export interface ProjectUploadFile {
  fileName: string;
  contentType: string;
  size: number;
  body: Buffer;
}

export interface ProjectUploadDescriptor {
  fileName: string;
  contentType: string;
  size: number;
}

export interface CreateProjectFromUploadsResult {
  project: Project;
  uploadedImages: UploadedImage[];
  warning: string | null;
}

export interface ProjectCreationSettings {
  displayName?: string | null;
  isPublic?: boolean;
}

export class ProjectUploadValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "ProjectUploadValidationError";
  }
}

export async function createProjectFromUploads(
  files: ProjectUploadFile[],
  options: {
    db?: DatabaseClient;
    storage?: StorageDriver;
    petPresenceDetector?: PetPresenceDetector | null;
    settings?: ProjectCreationSettings;
  } = {}
): Promise<CreateProjectFromUploadsResult> {
  validateProjectUploads(files);
  const settings = normalizeProjectCreationSettings(options.settings);

  await assertUploadsContainPet(files, options.petPresenceDetector);

  const db = options.db ?? getDatabase();
  const storage = options.storage ?? createLocalStorageDriver();
  let project: Project | null = null;
  const storedKeys: string[] = [];

  try {
    project = createIntakeProjectRecord(
      {
        displayName: settings.displayName,
        isPublic: settings.isPublic
      },
      db
    );
    const storedImages = [];

    for (const [index, file] of files.entries()) {
      const mimeType = resolveImageMimeType(file.fileName, file.contentType);

      if (!mimeType) {
        throw new ProjectUploadValidationError(
          "Only JPG, PNG, WEBP, and HEIC images can be uploaded."
        );
      }

      const key = `projects/${project.id}/uploads/${String(index + 1).padStart(
        2,
        "0"
      )}-${randomUUID()}${getExtensionForMimeType(mimeType, file.fileName)}`;
      const stored = await storage.putObject({
        key,
        body: file.body,
        contentType: mimeType
      });

      storedKeys.push(stored.key);
      storedImages.push({
        originalUrl: stored.url,
        thumbnailUrl: null,
        width: null,
        height: null,
        mimeType,
        exifMetadata: null,
        uploadOrder: index
      });
    }

    const uploadedImages = addUploadedImages(project.id, storedImages, db);
    enqueueSpacePreviewJob(project.id, db);
    enqueuePetAnalysisJob(project.id, db);
    const stage = getLoadingStage(0);
    const updatedProject =
      updateProjectLifecycle(
        project.id,
        {
          status: "analyzing",
          currentStage: stage.title,
          currentStepIndex: stage.index,
          totalSteps: TOTAL_LOADING_STEPS,
          debugProgressPercent: 12,
          selectedPetId: null
        },
        db
      ) ?? project;

    return {
      project: updatedProject,
      uploadedImages,
      warning:
        files.length < MIN_RECOMMENDED_IMAGE_COUNT
          ? "One or two photos can work, but a few more may help the space feel closer."
          : null
    };
  } catch (error) {
    await cleanupFailedProjectUpload({ project, storedKeys, storage, db });
    throw error;
  }
}

export function validateProjectUploads(files: ProjectUploadFile[]): void {
  validateProjectUploadDescriptors(files);
}

async function assertUploadsContainPet(
  files: ProjectUploadFile[],
  detector: PetPresenceDetector | null | undefined
): Promise<void> {
  if (!detector) {
    return;
  }

  let result;

  try {
    result = await detector.detectPetPresence({
      images: files.map((file) => ({
        fileName: file.fileName,
        mimeType: resolveImageMimeType(file.fileName, file.contentType) ?? file.contentType,
        body: file.body
      }))
    });
  } catch {
    throw new ProjectUploadValidationError(
      PET_PRESENCE_CHECK_UNAVAILABLE_MESSAGE
    );
  }

  if (!result.hasPet) {
    throw new ProjectUploadValidationError(NO_PET_UPLOAD_MESSAGE);
  }
}

export function validateProjectDisplayName(displayName: string): string {
  const normalizedName = displayName.trim().replace(/\s+/g, " ");

  if (normalizedName.length === 0) {
    throw new ProjectUploadValidationError("Add your pet's name to begin.");
  }

  if (normalizedName.length > MAX_PROJECT_DISPLAY_NAME_LENGTH) {
    throw new ProjectUploadValidationError(
      `Keep the name under ${MAX_PROJECT_DISPLAY_NAME_LENGTH} characters.`
    );
  }

  return normalizedName;
}

export function validateProjectUploadDescriptors(
  files: ProjectUploadDescriptor[]
): void {
  if (files.length === 0) {
    throw new ProjectUploadValidationError("Choose at least one photo to begin.");
  }

  if (files.length > MAX_PROJECT_IMAGE_COUNT) {
    throw new ProjectUploadValidationError(
      `Choose up to ${MAX_PROJECT_IMAGE_COUNT} photos for this first version.`
    );
  }

  for (const file of files) {
    if (file.size <= 0) {
      throw new ProjectUploadValidationError("One of the selected files is empty.");
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ProjectUploadValidationError(
        "Each photo needs to be 15 MB or smaller."
      );
    }

    if (!resolveImageMimeType(file.fileName, file.contentType)) {
      throw new ProjectUploadValidationError(
        "Only JPG, PNG, WEBP, and HEIC images can be uploaded."
      );
    }
  }
}

export function resolveImageMimeType(
  fileName: string,
  contentType: string
): AcceptedImageMimeType | null {
  const normalizedContentType = contentType.toLowerCase().split(";")[0]?.trim();

  if (isAcceptedImageMimeType(normalizedContentType)) {
    return normalizedContentType;
  }

  const extension = path.extname(fileName).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    default:
      return null;
  }
}

function isAcceptedImageMimeType(
  contentType: string | undefined
): contentType is AcceptedImageMimeType {
  return ACCEPTED_IMAGE_MIME_TYPES.some((accepted) => accepted === contentType);
}

function getExtensionForMimeType(
  mimeType: AcceptedImageMimeType,
  fileName: string
): string {
  const currentExtension = path.extname(fileName).toLowerCase();

  if (isAcceptedImageExtension(currentExtension)) {
    return currentExtension === ".jpeg" ? ".jpg" : currentExtension;
  }

  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/jpeg":
    default:
      return ".jpg";
  }
}

function isAcceptedImageExtension(extension: string): boolean {
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(
    extension
  );
}

function normalizeProjectCreationSettings(
  settings: ProjectCreationSettings | undefined
): Required<ProjectCreationSettings> {
  const displayName =
    typeof settings?.displayName === "string" && settings.displayName.trim()
      ? settings.displayName.trim().replace(/\s+/g, " ")
      : null;

  if (
    displayName &&
    displayName.length > MAX_PROJECT_DISPLAY_NAME_LENGTH
  ) {
    throw new ProjectUploadValidationError(
      `Keep the name under ${MAX_PROJECT_DISPLAY_NAME_LENGTH} characters.`
    );
  }

  return {
    displayName,
    isPublic: settings?.isPublic === true
  };
}

async function cleanupFailedProjectUpload({
  project,
  storedKeys,
  storage,
  db
}: {
  project: Project | null;
  storedKeys: string[];
  storage: StorageDriver;
  db: DatabaseClient;
}): Promise<void> {
  await Promise.allSettled(storedKeys.map((key) => storage.deleteObject(key)));
  if (project && "deletePrefix" in storage && typeof storage.deletePrefix === "function") {
    await storage.deletePrefix(`projects/${project.id}`);
  }

  if (project) {
    try {
      db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
    } catch (error) {
      console.error("Failed to clean up incomplete project upload", error);
    }
  }
}
