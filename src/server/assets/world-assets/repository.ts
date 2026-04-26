import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDatabase, type DatabaseClient } from "@/server/db";
import { createLocalStorageDriver, type StorageDriver } from "@/server/storage";
import type {
  CameraPose,
  SceneCluster,
  SceneClusterStatus,
  UploadedImage,
  WorldAsset
} from "@/types";
import { buildWorldAssetManifest, type WorldAssetManifest } from "@/world";

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

interface SceneClusterRow {
  id: string;
  project_id: string;
  label: string;
  source_image_ids_json: string;
  representative_image_ids_json: string;
  spatial_prompt: string | null;
  seed_image_urls_json: string;
  world_labs_operation_id: string | null;
  world_id: string | null;
  status: SceneClusterStatus;
}

interface WorldAssetRow {
  id: string;
  project_id: string;
  scene_cluster_id: string;
  world_id: string;
  spz_url_100k: string | null;
  spz_url_500k: string | null;
  spz_url_full_res: string | null;
  collider_mesh_url: string | null;
  pano_url: string | null;
  thumbnail_url: string | null;
  ground_plane_offset: number;
  initial_camera_pose_json: string | null;
}

export interface CreateSceneClusterRecordInput {
  id?: string;
  projectId: string;
  label: string;
  sourceImageIds: string[];
  representativeImageIds: string[];
  spatialPrompt: string | null;
  seedImageUrls?: string[];
  worldLabsOperationId?: string | null;
  worldId?: string | null;
  status?: SceneClusterStatus;
}

export interface UpdateSceneClusterRecordInput {
  label?: string;
  sourceImageIds?: string[];
  representativeImageIds?: string[];
  spatialPrompt?: string | null;
  seedImageUrls?: string[];
  worldLabsOperationId?: string | null;
  worldId?: string | null;
  status?: SceneClusterStatus;
}

export interface PersistWorldAssetManifestResult {
  asset: WorldAsset;
  manifest: WorldAssetManifest;
  manifestUrl: string;
  manifestKey: string;
}

export function listUploadedImagesForProject(
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

export function getUploadedImagesByIds(
  projectId: string,
  imageIds: string[],
  db: DatabaseClient = getDatabase()
): UploadedImage[] {
  if (imageIds.length === 0) {
    return [];
  }

  const imageIdSet = new Set(imageIds);
  return listUploadedImagesForProject(projectId, db).filter((image) =>
    imageIdSet.has(image.id)
  );
}

export function createSceneClusterRecord(
  input: CreateSceneClusterRecordInput,
  db: DatabaseClient = getDatabase()
): SceneCluster {
  const now = new Date().toISOString();
  const sceneCluster: SceneCluster = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    label: input.label,
    sourceImageIds: input.sourceImageIds,
    representativeImageIds: input.representativeImageIds,
    spatialPrompt: input.spatialPrompt,
    seedImageUrls: input.seedImageUrls ?? [],
    worldLabsOperationId: input.worldLabsOperationId ?? null,
    worldId: input.worldId ?? null,
    status: input.status ?? "selected"
  };

  db.prepare(
    `INSERT INTO scene_clusters (
      id, project_id, label, source_image_ids_json,
      representative_image_ids_json, spatial_prompt, seed_image_urls_json,
      world_labs_operation_id, world_id, status, created_at, updated_at
    ) VALUES (
      @id, @projectId, @label, @sourceImageIdsJson,
      @representativeImageIdsJson, @spatialPrompt, @seedImageUrlsJson,
      @worldLabsOperationId, @worldId, @status, @createdAt, @updatedAt
    )`
  ).run({
    ...sceneCluster,
    sourceImageIdsJson: JSON.stringify(sceneCluster.sourceImageIds),
    representativeImageIdsJson: JSON.stringify(sceneCluster.representativeImageIds),
    seedImageUrlsJson: JSON.stringify(sceneCluster.seedImageUrls),
    createdAt: now,
    updatedAt: now
  });

  return sceneCluster;
}

export function getSceneClusterRecord(
  sceneClusterId: string,
  db: DatabaseClient = getDatabase()
): SceneCluster | null {
  const row = db
    .prepare("SELECT * FROM scene_clusters WHERE id = ?")
    .get(sceneClusterId) as SceneClusterRow | undefined;

  return row ? mapSceneClusterRow(row) : null;
}

export function getSelectedSceneClusterForProject(
  projectId: string,
  db: DatabaseClient = getDatabase()
): SceneCluster | null {
  const row = db
    .prepare(
      `SELECT *
       FROM scene_clusters
       WHERE project_id = ?
       ORDER BY CASE status WHEN 'ready' THEN 0 WHEN 'waiting_for_world' THEN 1 ELSE 2 END,
                updated_at DESC
       LIMIT 1`
    )
    .get(projectId) as SceneClusterRow | undefined;

  return row ? mapSceneClusterRow(row) : null;
}

export function updateSceneClusterRecord(
  sceneClusterId: string,
  input: UpdateSceneClusterRecordInput,
  db: DatabaseClient = getDatabase()
): SceneCluster | null {
  const current = getSceneClusterRecord(sceneClusterId, db);

  if (!current) {
    return null;
  }

  const next: SceneCluster = {
    ...current,
    label: input.label ?? current.label,
    sourceImageIds: input.sourceImageIds ?? current.sourceImageIds,
    representativeImageIds:
      input.representativeImageIds ?? current.representativeImageIds,
    spatialPrompt:
      input.spatialPrompt === undefined ? current.spatialPrompt : input.spatialPrompt,
    seedImageUrls: input.seedImageUrls ?? current.seedImageUrls,
    worldLabsOperationId:
      input.worldLabsOperationId === undefined
        ? current.worldLabsOperationId
        : input.worldLabsOperationId,
    worldId: input.worldId === undefined ? current.worldId : input.worldId,
    status: input.status ?? current.status
  };

  db.prepare(
    `UPDATE scene_clusters
     SET label = ?,
         source_image_ids_json = ?,
         representative_image_ids_json = ?,
         spatial_prompt = ?,
         seed_image_urls_json = ?,
         world_labs_operation_id = ?,
         world_id = ?,
         status = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    next.label,
    JSON.stringify(next.sourceImageIds),
    JSON.stringify(next.representativeImageIds),
    next.spatialPrompt,
    JSON.stringify(next.seedImageUrls),
    next.worldLabsOperationId,
    next.worldId,
    next.status,
    new Date().toISOString(),
    sceneClusterId
  );

  return getSceneClusterRecord(sceneClusterId, db);
}

export function upsertWorldAssetRecord(
  asset: WorldAsset,
  db: DatabaseClient = getDatabase()
): WorldAsset {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO world_assets (
      id, project_id, scene_cluster_id, world_id,
      spz_url_100k, spz_url_500k, spz_url_full_res,
      collider_mesh_url, pano_url, thumbnail_url, ground_plane_offset,
      initial_camera_pose_json, created_at, updated_at
    ) VALUES (
      @id, @projectId, @sceneClusterId, @worldId,
      @spzUrl100k, @spzUrl500k, @spzUrlFullRes,
      @colliderMeshUrl, @panoUrl, @thumbnailUrl, @groundPlaneOffset,
      @initialCameraPoseJson, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      spz_url_100k = excluded.spz_url_100k,
      spz_url_500k = excluded.spz_url_500k,
      spz_url_full_res = excluded.spz_url_full_res,
      collider_mesh_url = excluded.collider_mesh_url,
      pano_url = excluded.pano_url,
      thumbnail_url = excluded.thumbnail_url,
      ground_plane_offset = excluded.ground_plane_offset,
      initial_camera_pose_json = excluded.initial_camera_pose_json,
      updated_at = excluded.updated_at`
  ).run({
    ...asset,
    initialCameraPoseJson: asset.initialCameraPose
      ? JSON.stringify(asset.initialCameraPose)
      : null,
    createdAt: now,
    updatedAt: now
  });

  return asset;
}

export async function persistWorldAssetManifest(
  asset: WorldAsset,
  options: {
    storage?: StorageDriver;
    db?: DatabaseClient;
    generatedAt?: string;
  } = {}
): Promise<PersistWorldAssetManifestResult> {
  const db = options.db ?? getDatabase();
  const storage = options.storage ?? createLocalStorageDriver();
  const manifest = buildWorldAssetManifest(asset, options.generatedAt);
  const persistedAsset = upsertWorldAssetRecord(asset, db);
  const manifestKey = path.posix.join(
    "projects",
    asset.projectId,
    "world-assets",
    asset.worldId,
    "manifest.json"
  );
  const stored = await putWorldAssetManifest(storage, {
    key: manifestKey,
    body: `${JSON.stringify(manifest, null, 2)}\n`,
    contentType: "application/json"
  });

  return {
    asset: persistedAsset,
    manifest,
    manifestUrl: stored.url,
    manifestKey
  };
}

async function putWorldAssetManifest(
  storage: StorageDriver,
  input: {
    key: string;
    body: string;
    contentType: string;
  }
): Promise<{ url: string }> {
  try {
    return await storage.putObject(input);
  } catch {
    throw new Error("WorldAsset manifest could not be stored.");
  }
}

export function getWorldAssetRecord(
  worldAssetId: string,
  db: DatabaseClient = getDatabase()
): WorldAsset | null {
  const row = db
    .prepare("SELECT * FROM world_assets WHERE id = ?")
    .get(worldAssetId) as WorldAssetRow | undefined;

  return row ? mapWorldAssetRow(row) : null;
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
    exifMetadata: parseJson(row.exif_metadata_json, null),
    uploadOrder: row.upload_order
  };
}

function mapSceneClusterRow(row: SceneClusterRow): SceneCluster {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    sourceImageIds: parseJsonArray(row.source_image_ids_json),
    representativeImageIds: parseJsonArray(row.representative_image_ids_json),
    spatialPrompt: row.spatial_prompt,
    seedImageUrls: parseJsonArray(row.seed_image_urls_json),
    worldLabsOperationId: row.world_labs_operation_id,
    worldId: row.world_id,
    status: row.status
  };
}

function mapWorldAssetRow(row: WorldAssetRow): WorldAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    sceneClusterId: row.scene_cluster_id,
    worldId: row.world_id,
    spzUrl100k: row.spz_url_100k,
    spzUrl500k: row.spz_url_500k,
    spzUrlFullRes: row.spz_url_full_res,
    colliderMeshUrl: row.collider_mesh_url,
    panoUrl: row.pano_url,
    thumbnailUrl: row.thumbnail_url,
    groundPlaneOffset: row.ground_plane_offset,
    initialCameraPose: row.initial_camera_pose_json
      ? (parseJson(row.initial_camera_pose_json, null) as CameraPose | null)
      : null
  };
}

function parseJsonArray(value: string): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
