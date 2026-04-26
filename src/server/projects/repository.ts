import { randomUUID } from "node:crypto";
import type {
  GenerationJobStatus,
  GenerationJobType,
  JsonValue,
  PetProfile,
  Project,
  ProjectStatus,
  UploadedImage
} from "@/types";
import {
  createProjectRecord,
  getDatabase,
  getProjectRecord,
  type DatabaseClient
} from "@/server/db";
import {
  getDefaultStageIndexForStatus,
  getLoadingStage,
  TOTAL_LOADING_STEPS
} from "./stages";

interface UploadedImageRow {
  id: string;
  project_id: string;
  original_url: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  mime_type: string;
  exif_metadata_json: string | null;
  upload_order: number;
}

interface PetProfileRow {
  id: string;
  project_id: string;
  source_candidate_ids_json: string;
  species: string | null;
  name: string | null;
  trait_summary: string;
  distinctive_markings_json: string;
  face_description: string | null;
  body_description: string | null;
  accessories_json: string;
  selection_confidence: number;
  clarification_required: number;
  clarification_answer: string | null;
}

interface GenerationJobSummaryRow {
  type: GenerationJobType;
  status: GenerationJobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  error_message: string | null;
}

export interface CreateUploadedImageInput {
  id?: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  mimeType: string;
  exifMetadata?: JsonValue | null;
  uploadOrder: number;
}

export interface ProjectLifecycleUpdate {
  status?: ProjectStatus;
  currentStage?: string | null;
  currentStepIndex?: number;
  totalSteps?: number;
  debugProgressPercent?: number;
  selectedPetId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  completedAt?: string | null;
}

export interface ProjectBundle {
  project: Project;
  uploadedImages: UploadedImage[];
  petProfile: PetProfile | null;
  retryingJobs: GenerationJobSummary[];
}

export interface GenerationJobSummary {
  type: GenerationJobType;
  status: GenerationJobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  errorMessage: string | null;
}

export function createIntakeProjectRecord(
  db: DatabaseClient = getDatabase()
): Project {
  return createProjectRecord(
    {
      status: "uploading",
      currentStage: getLoadingStage(0).title,
      totalSteps: TOTAL_LOADING_STEPS
    },
    db
  );
}

export function addUploadedImages(
  projectId: string,
  images: CreateUploadedImageInput[],
  db: DatabaseClient = getDatabase()
): UploadedImage[] {
  const now = new Date().toISOString();
  const records = images.map((image) => ({
    id: image.id ?? randomUUID(),
    projectId,
    originalUrl: image.originalUrl,
    thumbnailUrl: image.thumbnailUrl ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
    mimeType: image.mimeType,
    exifMetadata: image.exifMetadata ?? null,
    uploadOrder: image.uploadOrder
  }));

  const insert = db.prepare(
    `INSERT INTO uploaded_images (
      id, project_id, original_url, thumbnail_url, width, height, mime_type,
      exif_metadata_json, upload_order, created_at
    ) VALUES (
      @id, @projectId, @originalUrl, @thumbnailUrl, @width, @height, @mimeType,
      @exifMetadataJson, @uploadOrder, @createdAt
    )`
  );

  const transaction = db.transaction(() => {
    for (const record of records) {
      insert.run({
        ...record,
        exifMetadataJson:
          record.exifMetadata === null ? null : JSON.stringify(record.exifMetadata),
        createdAt: now
      });
    }
  });

  transaction();

  return records;
}

export function listUploadedImages(
  projectId: string,
  db: DatabaseClient = getDatabase()
): UploadedImage[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM uploaded_images
       WHERE project_id = ?
       ORDER BY upload_order ASC`
    )
    .all(projectId) as UploadedImageRow[];

  return rows.map(mapUploadedImageRow);
}

export function createClarificationPetProfile(
  projectId: string,
  sourceCandidateIds: string[],
  db: DatabaseClient = getDatabase()
): PetProfile {
  const now = new Date().toISOString();
  const profile: PetProfile = {
    id: randomUUID(),
    projectId,
    sourceCandidateIds,
    species: null,
    name: null,
    traitSummary: "Awaiting a visual detail from the uploaded photos.",
    distinctiveMarkings: [],
    faceDescription: null,
    bodyDescription: null,
    accessories: [],
    selectionConfidence: 0.35,
    clarificationRequired: true,
    clarificationAnswer: null
  };

  db.prepare(
    `INSERT INTO pet_profiles (
      id, project_id, source_candidate_ids_json, species, name, trait_summary,
      distinctive_markings_json, face_description, body_description,
      accessories_json, selection_confidence, clarification_required,
      clarification_answer, created_at, updated_at
    ) VALUES (
      @id, @projectId, @sourceCandidateIdsJson, @species, @name, @traitSummary,
      @distinctiveMarkingsJson, @faceDescription, @bodyDescription,
      @accessoriesJson, @selectionConfidence, @clarificationRequired,
      @clarificationAnswer, @createdAt, @updatedAt
    )`
  ).run({
    ...profile,
    sourceCandidateIdsJson: JSON.stringify(profile.sourceCandidateIds),
    distinctiveMarkingsJson: JSON.stringify(profile.distinctiveMarkings),
    accessoriesJson: JSON.stringify(profile.accessories),
    clarificationRequired: profile.clarificationRequired ? 1 : 0,
    createdAt: now,
    updatedAt: now
  });

  return profile;
}

export function getProjectPetProfile(
  projectId: string,
  db: DatabaseClient = getDatabase()
): PetProfile | null {
  const row = db
    .prepare(
      `SELECT *
       FROM pet_profiles
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(projectId) as PetProfileRow | undefined;

  return row ? mapPetProfileRow(row) : null;
}

export function confirmPetProfileWithClarification(
  projectId: string,
  clarificationAnswer: string,
  db: DatabaseClient = getDatabase()
): PetProfile | null {
  const existing = getProjectPetProfile(projectId, db);

  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE pet_profiles
     SET trait_summary = ?,
         clarification_required = 0,
         clarification_answer = ?,
         selection_confidence = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    `Selected by visual detail: ${clarificationAnswer}`,
    clarificationAnswer,
    0.7,
    now,
    existing.id
  );

  return getProjectPetProfile(projectId, db);
}

export function updateProjectLifecycle(
  projectId: string,
  input: ProjectLifecycleUpdate,
  db: DatabaseClient = getDatabase()
): Project | null {
  const current = getProjectRecord(projectId, db);

  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  const status = input.status ?? current.status;
  const currentStepIndex =
    input.currentStepIndex ?? current.currentStepIndex ?? getDefaultStageIndexForStatus(status);
  const completedAt =
    input.completedAt !== undefined
      ? input.completedAt
      : status === "ready"
        ? current.completedAt ?? now
        : current.completedAt;

  db.prepare(
    `UPDATE projects
     SET status = @status,
         current_stage = @currentStage,
         current_step_index = @currentStepIndex,
         total_steps = @totalSteps,
         debug_progress_percent = @debugProgressPercent,
         selected_pet_id = @selectedPetId,
         error_code = @errorCode,
         error_message = @errorMessage,
         retry_count = @retryCount,
         updated_at = @updatedAt,
         completed_at = @completedAt
     WHERE id = @id`
  ).run({
    id: projectId,
    status,
    currentStage:
      input.currentStage !== undefined
        ? input.currentStage
        : current.currentStage ?? getLoadingStage(currentStepIndex).title,
    currentStepIndex,
    totalSteps: input.totalSteps ?? current.totalSteps,
    debugProgressPercent:
      input.debugProgressPercent ?? current.debugProgressPercent,
    selectedPetId:
      input.selectedPetId !== undefined ? input.selectedPetId : current.selectedPetId,
    errorCode: input.errorCode !== undefined ? input.errorCode : current.errorCode,
    errorMessage:
      input.errorMessage !== undefined ? input.errorMessage : current.errorMessage,
    retryCount: input.retryCount ?? current.retryCount,
    updatedAt: now,
    completedAt
  });

  return getProjectRecord(projectId, db);
}

export function getProjectBundle(
  projectId: string,
  db: DatabaseClient = getDatabase()
): ProjectBundle | null {
  const project = getProjectRecord(projectId, db);

  if (!project) {
    return null;
  }

  return {
    project,
    uploadedImages: listUploadedImages(projectId, db),
    petProfile: getProjectPetProfile(projectId, db),
    retryingJobs: listRetryingJobs(projectId, db)
  };
}

export function listRetryingJobs(
  projectId: string,
  db: DatabaseClient = getDatabase()
): GenerationJobSummary[] {
  const rows = db
    .prepare(
      `SELECT type, status, attempts, max_attempts, run_after, error_message
       FROM generation_jobs
       WHERE project_id = ?
         AND status = 'retrying'
       ORDER BY run_after ASC`
    )
    .all(projectId) as GenerationJobSummaryRow[];

  return rows.map((row) => ({
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    errorMessage: row.error_message
  }));
}

function mapUploadedImageRow(row: UploadedImageRow): UploadedImage {
  return {
    id: row.id,
    projectId: row.project_id,
    originalUrl: row.original_url,
    thumbnailUrl: row.thumbnail_url,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    exifMetadata: row.exif_metadata_json
      ? parseJson(row.exif_metadata_json, null)
      : null,
    uploadOrder: row.upload_order
  };
}

function mapPetProfileRow(row: PetProfileRow): PetProfile {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceCandidateIds: parseJsonArray(row.source_candidate_ids_json),
    species: row.species,
    name: row.name,
    traitSummary: row.trait_summary,
    distinctiveMarkings: parseJsonArray(row.distinctive_markings_json),
    faceDescription: row.face_description,
    bodyDescription: row.body_description,
    accessories: parseJsonArray(row.accessories_json),
    selectionConfidence: row.selection_confidence,
    clarificationRequired: row.clarification_required === 1,
    clarificationAnswer: row.clarification_answer
  };
}

function parseJson(value: string, fallback: JsonValue): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return fallback;
  }
}

function parseJsonArray(value: string): string[] {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}
