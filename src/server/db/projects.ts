import { randomUUID } from "node:crypto";
import type { Project, ProjectStatus } from "@/types";
import { getDatabase, type DatabaseClient } from "./connection";

interface ProjectRow {
  id: string;
  status: ProjectStatus;
  current_stage: string | null;
  current_step_index: number;
  total_steps: number;
  debug_progress_percent: number;
  selected_pet_id: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateProjectInput {
  id?: string;
  status?: ProjectStatus;
  currentStage?: string | null;
  totalSteps?: number;
}

export function createProjectRecord(
  input: CreateProjectInput = {},
  db: DatabaseClient = getDatabase()
): Project {
  const now = new Date().toISOString();
  const project: Project = {
    id: input.id ?? randomUUID(),
    status: input.status ?? "draft",
    currentStage: input.currentStage ?? null,
    currentStepIndex: 0,
    totalSteps: input.totalSteps ?? 7,
    debugProgressPercent: 0,
    selectedPetId: null,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  db.prepare(
    `INSERT INTO projects (
      id, status, current_stage, current_step_index, total_steps,
      debug_progress_percent, selected_pet_id, error_code, error_message,
      retry_count, created_at, updated_at, completed_at
    ) VALUES (
      @id, @status, @currentStage, @currentStepIndex, @totalSteps,
      @debugProgressPercent, @selectedPetId, @errorCode, @errorMessage,
      @retryCount, @createdAt, @updatedAt, @completedAt
    )`
  ).run(project);

  return project;
}

export function getProjectRecord(
  projectId: string,
  db: DatabaseClient = getDatabase()
): Project | null {
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  return row ? mapProjectRow(row) : null;
}

export function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
  db: DatabaseClient = getDatabase()
): Project | null {
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE projects
     SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = 'ready' THEN ? ELSE completed_at END
     WHERE id = ?`
  ).run(status, now, status, now, projectId);

  return getProjectRecord(projectId, db);
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    status: row.status,
    currentStage: row.current_stage,
    currentStepIndex: row.current_step_index,
    totalSteps: row.total_steps,
    debugProgressPercent: row.debug_progress_percent,
    selectedPetId: row.selected_pet_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}
