import { randomUUID } from "node:crypto";
import type {
  GenerationJob,
  GenerationJobStatus,
  GenerationJobType,
  JsonValue
} from "@/types";
import { getDatabase, type DatabaseClient } from "@/server/db";

interface GenerationJobRow {
  id: string;
  project_id: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  priority: number;
  payload_json: string;
  result_json: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateGenerationJobInput {
  id?: string;
  projectId: string;
  type: GenerationJobType;
  payload?: JsonValue;
  priority?: number;
  maxAttempts?: number;
  runAfter?: Date;
}

export interface ClaimGenerationJobInput {
  workerId: string;
  now?: Date;
}

export interface FailGenerationJobInput {
  jobId: string;
  errorCode?: string;
  errorMessage: string;
  retryDelayMs?: number;
  now?: Date;
}

export function createGenerationJob(
  input: CreateGenerationJobInput,
  db: DatabaseClient = getDatabase()
): GenerationJob {
  const now = new Date().toISOString();
  const job: GenerationJob = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    type: input.type,
    status: "queued",
    priority: input.priority ?? 0,
    payload: input.payload ?? {},
    result: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    runAfter: (input.runAfter ?? new Date()).toISOString(),
    lockedAt: null,
    lockedBy: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  db.prepare(
    `INSERT INTO generation_jobs (
      id, project_id, type, status, priority, payload_json, result_json,
      error_code, error_message, attempts, max_attempts, run_after,
      locked_at, locked_by, created_at, updated_at, completed_at
    ) VALUES (
      @id, @projectId, @type, @status, @priority, @payloadJson, @resultJson,
      @errorCode, @errorMessage, @attempts, @maxAttempts, @runAfter,
      @lockedAt, @lockedBy, @createdAt, @updatedAt, @completedAt
    )`
  ).run({
    ...job,
    payloadJson: JSON.stringify(job.payload),
    resultJson: null
  });

  return job;
}

export function getGenerationJob(
  jobId: string,
  db: DatabaseClient = getDatabase()
): GenerationJob | null {
  const row = db
    .prepare("SELECT * FROM generation_jobs WHERE id = ?")
    .get(jobId) as GenerationJobRow | undefined;

  return row ? mapGenerationJobRow(row) : null;
}

export function claimNextGenerationJob(
  input: ClaimGenerationJobInput,
  db: DatabaseClient = getDatabase()
): GenerationJob | null {
  const now = (input.now ?? new Date()).toISOString();

  const transaction = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT *
         FROM generation_jobs
         WHERE status IN ('queued', 'retrying')
           AND run_after <= ?
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`
      )
      .get(now) as GenerationJobRow | undefined;

    if (!row) {
      return null;
    }

    db.prepare(
      `UPDATE generation_jobs
       SET status = 'running',
           attempts = attempts + 1,
           locked_at = ?,
           locked_by = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(now, input.workerId, now, row.id);

    return getGenerationJob(row.id, db);
  });

  return transaction();
}

export function completeGenerationJob(
  jobId: string,
  result: JsonValue | null = null,
  db: DatabaseClient = getDatabase()
): GenerationJob | null {
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE generation_jobs
     SET status = 'succeeded',
         result_json = ?,
         error_code = NULL,
         error_message = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = ?,
         completed_at = ?
     WHERE id = ?`
  ).run(result === null ? null : JSON.stringify(result), now, now, jobId);

  return getGenerationJob(jobId, db);
}

export function failGenerationJob(
  input: FailGenerationJobInput,
  db: DatabaseClient = getDatabase()
): GenerationJob | null {
  const now = input.now ?? new Date();
  const current = getGenerationJob(input.jobId, db);

  if (!current) {
    return null;
  }

  const shouldRetry = current.attempts < current.maxAttempts;
  const status: GenerationJobStatus = shouldRetry ? "retrying" : "failed";
  const runAfter = new Date(
    now.getTime() + (input.retryDelayMs ?? defaultRetryDelayMs(current.attempts))
  ).toISOString();
  const completedAt = shouldRetry ? null : now.toISOString();

  db.prepare(
    `UPDATE generation_jobs
     SET status = ?,
         error_code = ?,
         error_message = ?,
         run_after = ?,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = ?,
         completed_at = ?
     WHERE id = ?`
  ).run(
    status,
    input.errorCode ?? "JOB_FAILED",
    input.errorMessage,
    runAfter,
    now.toISOString(),
    completedAt,
    input.jobId
  );

  return getGenerationJob(input.jobId, db);
}

function mapGenerationJobRow(row: GenerationJobRow): GenerationJob {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    priority: row.priority,
    payload: parseJson(row.payload_json, {}),
    result: row.result_json ? parseJson(row.result_json, null) : null,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function parseJson(value: string, fallback: JsonValue): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return fallback;
  }
}

function defaultRetryDelayMs(attempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}
