import { randomUUID } from "node:crypto";
import { getDatabase, type DatabaseClient } from "@/server/db";
import type { AudioAsset, AudioAssetKind, AudioAssetStatus } from "@/types";

interface AudioAssetRow {
  id: string;
  project_id: string;
  kind: AudioAssetKind;
  asset_key: string;
  prompt: string;
  audio_url: string | null;
  content_type: string;
  duration_ms: number | null;
  provider_name: string | null;
  provider_status: string | null;
  provider_error_message: string | null;
  status: AudioAssetStatus;
  created_at: string;
  updated_at: string;
}

export interface UpsertAudioAssetRecordInput {
  id?: string;
  projectId: string;
  kind: AudioAssetKind;
  assetKey: string;
  prompt: string;
  audioUrl?: string | null;
  contentType?: string;
  durationMs?: number | null;
  providerName?: string | null;
  providerStatus?: string | null;
  providerErrorMessage?: string | null;
  status: AudioAssetStatus;
}

export function upsertAudioAssetRecord(
  input: UpsertAudioAssetRecordInput,
  db: DatabaseClient = getDatabase()
): AudioAsset {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO audio_assets (
      id, project_id, kind, asset_key, prompt, audio_url, content_type,
      duration_ms, provider_name, provider_status, provider_error_message,
      status, created_at, updated_at
    ) VALUES (
      @id, @projectId, @kind, @assetKey, @prompt, @audioUrl, @contentType,
      @durationMs, @providerName, @providerStatus, @providerErrorMessage,
      @status, @createdAt, @updatedAt
    )
    ON CONFLICT(project_id, kind, asset_key) DO UPDATE SET
      prompt = excluded.prompt,
      audio_url = excluded.audio_url,
      content_type = excluded.content_type,
      duration_ms = excluded.duration_ms,
      provider_name = excluded.provider_name,
      provider_status = excluded.provider_status,
      provider_error_message = excluded.provider_error_message,
      status = excluded.status,
      updated_at = excluded.updated_at`
  ).run({
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    kind: input.kind,
    assetKey: input.assetKey,
    prompt: input.prompt,
    audioUrl: input.audioUrl ?? null,
    contentType: input.contentType ?? "audio/mpeg",
    durationMs: input.durationMs ?? null,
    providerName: input.providerName ?? null,
    providerStatus: input.providerStatus ?? null,
    providerErrorMessage: input.providerErrorMessage ?? null,
    status: input.status,
    createdAt: now,
    updatedAt: now
  });

  const record = getAudioAssetRecord(
    input.projectId,
    input.kind,
    input.assetKey,
    db
  );

  if (!record) {
    throw new Error("Audio asset record could not be persisted.");
  }

  return record;
}

export function getAudioAssetRecord(
  projectId: string,
  kind: AudioAssetKind,
  assetKey: string,
  db: DatabaseClient = getDatabase()
): AudioAsset | null {
  const row = db
    .prepare(
      `SELECT *
       FROM audio_assets
       WHERE project_id = ? AND kind = ? AND asset_key = ?`
    )
    .get(projectId, kind, assetKey) as AudioAssetRow | undefined;

  return row ? mapAudioAssetRow(row) : null;
}

export function listAudioAssetRecords(
  projectId: string,
  db: DatabaseClient = getDatabase()
): AudioAsset[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM audio_assets
       WHERE project_id = ?
       ORDER BY kind ASC, asset_key ASC`
    )
    .all(projectId) as AudioAssetRow[];

  return rows.map(mapAudioAssetRow);
}

function mapAudioAssetRow(row: AudioAssetRow): AudioAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    assetKey: row.asset_key,
    prompt: row.prompt,
    audioUrl: row.audio_url,
    contentType: row.content_type,
    durationMs: row.duration_ms,
    providerName: row.provider_name,
    providerStatus: row.provider_status,
    providerErrorMessage: row.provider_error_message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
