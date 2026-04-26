import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@/server/db";
import { getDatabase } from "@/server/db";
import type { MotionClip, MotionClipStatus } from "@/types";

interface MotionClipRow {
  id: string;
  project_id: string;
  pet_profile_id: string;
  motion_key: string;
  from_state: string;
  to_state: string;
  prompt: string;
  keyframe_image_urls_json: string;
  raw_video_url: string | null;
  processed_video_url: string | null;
  alpha_video_url: string | null;
  duration_ms: number | null;
  loopable: number;
  quality_score: number | null;
  provider_operation_id: string | null;
  provider_status: string | null;
  provider_error_message: string | null;
  postprocess_json: string | null;
  status: MotionClipStatus;
  created_at: string;
  updated_at: string;
}

export interface UpsertMotionClipInput {
  id?: string;
  projectId: string;
  petProfileId: string;
  motionKey: string;
  fromState: string;
  toState: string;
  prompt: string;
  keyframeImageUrls?: string[];
  rawVideoUrl?: string | null;
  processedVideoUrl?: string | null;
  alphaVideoUrl?: string | null;
  durationMs?: number | null;
  loopable?: boolean;
  qualityScore?: number | null;
  providerOperationId?: string | null;
  providerStatus?: string | null;
  providerErrorMessage?: string | null;
  postprocess?: MotionClip["postprocess"];
  status?: MotionClipStatus;
}

export interface MotionClipPatch {
  prompt?: string;
  keyframeImageUrls?: string[];
  rawVideoUrl?: string | null;
  processedVideoUrl?: string | null;
  alphaVideoUrl?: string | null;
  durationMs?: number | null;
  loopable?: boolean;
  qualityScore?: number | null;
  providerOperationId?: string | null;
  providerStatus?: string | null;
  providerErrorMessage?: string | null;
  postprocess?: MotionClip["postprocess"];
  status?: MotionClipStatus;
}

export function upsertMotionClipRecord(
  input: UpsertMotionClipInput,
  db: DatabaseClient = getDatabase()
): MotionClip {
  const existing = findMotionClipRecord(
    input.projectId,
    input.petProfileId,
    input.motionKey,
    db
  );

  if (existing) {
    return updateMotionClipRecord(
      existing.id,
      {
        prompt: input.prompt,
        keyframeImageUrls: input.keyframeImageUrls,
        rawVideoUrl: input.rawVideoUrl,
        processedVideoUrl: input.processedVideoUrl,
        alphaVideoUrl: input.alphaVideoUrl,
        durationMs: input.durationMs,
        loopable: input.loopable,
        qualityScore: input.qualityScore,
        providerOperationId: input.providerOperationId,
        providerStatus: input.providerStatus,
        providerErrorMessage: input.providerErrorMessage,
        postprocess: input.postprocess,
        status: input.status
      },
      db
    ) as MotionClip;
  }

  const now = new Date().toISOString();
  const clip: MotionClip = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    petProfileId: input.petProfileId,
    motionKey: input.motionKey,
    fromState: input.fromState,
    toState: input.toState,
    prompt: input.prompt,
    keyframeImageUrls: input.keyframeImageUrls ?? [],
    rawVideoUrl: input.rawVideoUrl ?? null,
    processedVideoUrl: input.processedVideoUrl ?? null,
    alphaVideoUrl: input.alphaVideoUrl ?? null,
    durationMs: input.durationMs ?? null,
    loopable: input.loopable ?? false,
    qualityScore: input.qualityScore ?? null,
    providerOperationId: input.providerOperationId ?? null,
    providerStatus: input.providerStatus ?? null,
    providerErrorMessage: input.providerErrorMessage ?? null,
    postprocess: input.postprocess ?? null,
    status: input.status ?? "pending"
  };

  db.prepare(
    `INSERT INTO motion_clips (
      id, project_id, pet_profile_id, motion_key, from_state, to_state,
      prompt, keyframe_image_urls_json, raw_video_url, processed_video_url,
      alpha_video_url, duration_ms, loopable, quality_score,
      provider_operation_id, provider_status, provider_error_message,
      postprocess_json, status,
      created_at, updated_at
    ) VALUES (
      @id, @projectId, @petProfileId, @motionKey, @fromState, @toState,
      @prompt, @keyframeImageUrlsJson, @rawVideoUrl, @processedVideoUrl,
      @alphaVideoUrl, @durationMs, @loopable, @qualityScore,
      @providerOperationId, @providerStatus, @providerErrorMessage,
      @postprocessJson, @status,
      @createdAt, @updatedAt
    )`
  ).run({
    ...clip,
    keyframeImageUrlsJson: JSON.stringify(clip.keyframeImageUrls),
    postprocessJson: clip.postprocess ? JSON.stringify(clip.postprocess) : null,
    loopable: clip.loopable ? 1 : 0,
    createdAt: now,
    updatedAt: now
  });

  return clip;
}

export function updateMotionClipRecord(
  clipId: string,
  patch: MotionClipPatch,
  db: DatabaseClient = getDatabase()
): MotionClip | null {
  const current = getMotionClipRecord(clipId, db);

  if (!current) {
    return null;
  }

  const next = {
    prompt: patch.prompt ?? current.prompt,
    keyframeImageUrlsJson: JSON.stringify(
      patch.keyframeImageUrls ?? current.keyframeImageUrls
    ),
    rawVideoUrl:
      patch.rawVideoUrl === undefined ? current.rawVideoUrl : patch.rawVideoUrl,
    processedVideoUrl:
      patch.processedVideoUrl === undefined
        ? current.processedVideoUrl
        : patch.processedVideoUrl,
    alphaVideoUrl:
      patch.alphaVideoUrl === undefined
        ? current.alphaVideoUrl
        : patch.alphaVideoUrl,
    durationMs:
      patch.durationMs === undefined ? current.durationMs : patch.durationMs,
    loopable:
      patch.loopable === undefined ? (current.loopable ? 1 : 0) : patch.loopable ? 1 : 0,
    qualityScore:
      patch.qualityScore === undefined
        ? current.qualityScore
        : patch.qualityScore,
    providerOperationId:
      patch.providerOperationId === undefined
        ? current.providerOperationId
        : patch.providerOperationId,
    providerStatus:
      patch.providerStatus === undefined
        ? current.providerStatus
        : patch.providerStatus,
    providerErrorMessage:
      patch.providerErrorMessage === undefined
        ? current.providerErrorMessage
        : patch.providerErrorMessage,
    postprocessJson:
      patch.postprocess === undefined
        ? current.postprocess
          ? JSON.stringify(current.postprocess)
          : null
        : patch.postprocess
          ? JSON.stringify(patch.postprocess)
          : null,
    status: patch.status ?? current.status,
    updatedAt: new Date().toISOString(),
    id: clipId
  };

  db.prepare(
    `UPDATE motion_clips
     SET prompt = @prompt,
         keyframe_image_urls_json = @keyframeImageUrlsJson,
         raw_video_url = @rawVideoUrl,
         processed_video_url = @processedVideoUrl,
         alpha_video_url = @alphaVideoUrl,
         duration_ms = @durationMs,
         loopable = @loopable,
         quality_score = @qualityScore,
         provider_operation_id = @providerOperationId,
         provider_status = @providerStatus,
         provider_error_message = @providerErrorMessage,
         postprocess_json = @postprocessJson,
         status = @status,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run(next);

  return getMotionClipRecord(clipId, db);
}

export function getMotionClipRecord(
  clipId: string,
  db: DatabaseClient = getDatabase()
): MotionClip | null {
  const row = db
    .prepare("SELECT * FROM motion_clips WHERE id = ?")
    .get(clipId) as MotionClipRow | undefined;

  return row ? mapMotionClipRow(row) : null;
}

export function findMotionClipRecord(
  projectId: string,
  petProfileId: string,
  motionKey: string,
  db: DatabaseClient = getDatabase()
): MotionClip | null {
  const row = db
    .prepare(
      `SELECT * FROM motion_clips
       WHERE project_id = ? AND pet_profile_id = ? AND motion_key = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(projectId, petProfileId, motionKey) as MotionClipRow | undefined;

  return row ? mapMotionClipRow(row) : null;
}

export function listMotionClipRecords(
  projectId: string,
  db: DatabaseClient = getDatabase()
): MotionClip[] {
  const rows = db
    .prepare(
      `SELECT * FROM motion_clips
       WHERE project_id = ?
       ORDER BY motion_key ASC, created_at ASC`
    )
    .all(projectId) as MotionClipRow[];

  return rows.map(mapMotionClipRow);
}

function mapMotionClipRow(row: MotionClipRow): MotionClip {
  return {
    id: row.id,
    projectId: row.project_id,
    petProfileId: row.pet_profile_id,
    motionKey: row.motion_key,
    fromState: row.from_state,
    toState: row.to_state,
    prompt: row.prompt,
    keyframeImageUrls: parseStringArray(row.keyframe_image_urls_json),
    rawVideoUrl: row.raw_video_url,
    processedVideoUrl: row.processed_video_url,
    alphaVideoUrl: row.alpha_video_url,
    durationMs: row.duration_ms,
    loopable: row.loopable === 1,
    qualityScore: row.quality_score,
    providerOperationId: row.provider_operation_id,
    providerStatus: row.provider_status,
    providerErrorMessage: row.provider_error_message,
    postprocess: parsePostprocess(row.postprocess_json),
    status: row.status
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parsePostprocess(value: string | null): MotionClip["postprocess"] {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as MotionClip["postprocess"];
  } catch {
    return null;
  }
}
