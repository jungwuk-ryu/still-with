import type {
  CameraPose,
  MotionClip,
  MotionClipStatus,
  PetProfile,
  Project,
  PetRuntimeState,
  WorldAsset
} from "@/types";
import {
  BACKGROUND_MUSIC_ASSET_KEY,
  getSceneAudioAssetKey,
  listAudioAssetRecords
} from "@/server/audio";
import { getDatabase, type DatabaseClient } from "@/server/db/connection";
import { createSpaceAccessToken } from "@/server/realtime/space-access";
import type {
  ExperienceAudioManifest,
  ExperienceManifest,
  ExperienceSpaceSummary,
  MotionIntentKey
} from "./types";

const DEMO_SPZ_URL = "https://sparkjs.dev/assets/splats/butterfly.spz";
const MAX_MANIFEST_ALTERNATE_SPACES = 2;

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

interface SceneClusterRow {
  id: string;
  project_id: string;
  label: string;
  source_image_ids_json: string;
  representative_image_ids_json: string;
  spatial_prompt: string | null;
  seed_image_urls_json: string;
  seed_prompt_version: string | null;
  world_labs_operation_id: string | null;
  world_id: string | null;
  status: string;
}

interface ProjectSelectionRow {
  id: string;
  status: string;
  display_name: string | null;
  selected_pet_id: string | null;
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
  provider_name: string | null;
  provider_status: string | null;
  provider_error_message: string | null;
  postprocess_json: string | null;
  status: MotionClipStatus;
}

interface PetRuntimeStateRow {
  project_id: string;
  current_pose: string;
  target_pose: string | null;
  current_clip_id: string | null;
  queued_motion_keys_json: string;
  last_user_intent: string | null;
  last_updated_at: string;
}

const DEFAULT_CAMERA_POSE: CameraPose = {
  position: [0, 1.22, 2.25],
  target: [0, 0.86, -0.62],
  fov: 46
};

export function getExperienceManifest(
  projectId: string,
  db: DatabaseClient = getDatabase(),
  options: { issueAccessTokens?: boolean; sceneClusterId?: string | null } = {}
): ExperienceManifest {
  const issueAccessTokens = options.issueAccessTokens ?? true;
  const projectSelection = getProjectSelection(projectId, db);
  const worldAsset = getWorldAssetForManifest(projectId, db, options.sceneClusterId);
  const sceneCluster = worldAsset
    ? getSceneCluster(worldAsset.sceneClusterId, db)
    : null;
  const activeSceneClusterId = worldAsset?.sceneClusterId ?? sceneCluster?.id ?? null;
  const petProfile = getSelectedPetProfile(
    projectId,
    projectSelection?.selectedPetId ?? null,
    db
  );
  const motionClips = petProfile ? getMotionClips(projectId, petProfile.id, db) : [];
  const audio = getExperienceAudioManifest(projectId, db, activeSceneClusterId);
  const runtimeState = getPetRuntimeState(projectId, db) ?? {
    projectId,
    currentPose: "stand",
    targetPose: null,
    currentClipId: null,
    queuedMotionKeys: [],
    lastUserIntent: null,
    lastUpdatedAt: new Date().toISOString()
  };
  const canIssueAccessTokens =
    Boolean(projectSelection) &&
    projectSelection?.status === "ready" &&
    issueAccessTokens;

  const idleClip = motionClips.find(
    (clip) => clip.status === "ready" && clip.motionKey === "stand_idle"
  );
  const posterUrl =
    idleClip?.keyframeImageUrls[0] ??
    motionClips.flatMap((clip) => clip.keyframeImageUrls)[0] ??
    worldAsset?.thumbnailUrl ??
    null;

  return {
    projectId,
    displayName: projectSelection?.displayName ?? null,
    world: {
      sceneClusterId: activeSceneClusterId,
      label: sceneCluster?.label ?? null,
      asset: worldAsset,
      tierHint: worldAsset ? "500k" : "stub",
      spzUrl: worldAsset?.spzUrl500k ?? worldAsset?.spzUrl100k ?? DEMO_SPZ_URL,
      panoUrl: worldAsset?.panoUrl ?? null,
      thumbnailUrl: worldAsset?.thumbnailUrl ?? null,
      groundPlaneOffset: worldAsset?.groundPlaneOffset ?? 0,
      initialCameraPose: DEFAULT_CAMERA_POSE,
      source: worldAsset ? "database" : "demo-stub"
    },
    spaces: getExperienceSpaceSummaries(projectId, db, activeSceneClusterId),
    pet: {
      profile: petProfile ? sanitizePetProfileForClient(petProfile) : null,
      motionClips,
      runtimeState,
      idleVideoUrl:
        idleClip?.processedVideoUrl ??
        idleClip?.alphaVideoUrl ??
        idleClip?.rawVideoUrl ??
        null,
      posterUrl,
      chromaKeyColor: getPetChromaKeyColor(idleClip, motionClips),
      placement: {
        position: [0.08, 0.02, -0.98],
        width: 1.36,
        height: 1.78
      }
    },
    audio,
    chatAccessToken: canIssueAccessTokens
      ? createSpaceAccessToken(projectId, Date.now(), db)
      : null,
    realtimeAccessToken: canIssueAccessTokens
      ? createSpaceAccessToken(projectId, Date.now(), db)
      : null,
    generatedAt: new Date().toISOString()
  };
}

export function getExperienceAudioManifest(
  projectId: string,
  db: DatabaseClient,
  sceneClusterId?: string | null
): ExperienceAudioManifest {
  const readyAudioAssets = listAudioAssetRecords(projectId, db).filter(
    (asset) => asset.status === "ready" && asset.audioUrl
  );
  const backgroundAssetKey = getSceneAudioAssetKey(
    sceneClusterId,
    BACKGROUND_MUSIC_ASSET_KEY
  );
  const backgroundMusic =
    readyAudioAssets.find(
      (asset) =>
        asset.kind === "background_music" &&
        asset.assetKey === backgroundAssetKey
    )?.audioUrl ??
    readyAudioAssets.find(
      (asset) =>
        asset.kind === "background_music" &&
        asset.assetKey === BACKGROUND_MUSIC_ASSET_KEY
    )?.audioUrl ?? null;
  const petSoundEffects: Partial<Record<MotionIntentKey, string>> = {};

  for (const asset of readyAudioAssets) {
    const audioUrl = asset.audioUrl;
    const motionIntent = getMotionIntentForAudioAsset(asset.assetKey, sceneClusterId);

    if (
      !audioUrl ||
      asset.kind !== "pet_sound_effect" ||
      !motionIntent
    ) {
      continue;
    }

    petSoundEffects[motionIntent] = audioUrl;
  }

  return {
    backgroundMusicUrl: backgroundMusic,
    petSoundEffects
  };
}

function getMotionIntentForAudioAsset(
  assetKey: string,
  sceneClusterId?: string | null
): MotionIntentKey | null {
  if (isMotionIntentKey(assetKey)) {
    return assetKey;
  }

  if (!sceneClusterId) {
    return null;
  }

  const prefix = `space:${sceneClusterId}:`;

  if (!assetKey.startsWith(prefix)) {
    return null;
  }

  const unscopedKey = assetKey.slice(prefix.length);
  return isMotionIntentKey(unscopedKey) ? unscopedKey : null;
}

function isMotionIntentKey(value: string): value is MotionIntentKey {
  return (
    value === "idle" ||
    value === "look_at_me" ||
    value === "turn_around" ||
    value === "sit" ||
    value === "come_closer"
  );
}

function getPetChromaKeyColor(
  idleClip: MotionClip | undefined,
  motionClips: readonly MotionClip[]
): "green" | "blue" {
  const keyColor =
    idleClip?.postprocess?.chromaKeyColor ??
    motionClips.find((clip) => clip.postprocess?.chromaKeyColor)?.postprocess
      ?.chromaKeyColor;

  return keyColor === "blue" ? "blue" : "green";
}

export function updatePetRuntimeState(
  state: PetRuntimeState,
  db: DatabaseClient = getDatabase()
): PetRuntimeState {
  const projectExists = db
    .prepare("SELECT 1 FROM projects WHERE id = ?")
    .get(state.projectId);

  if (!projectExists) {
    return state;
  }

  db.prepare(
    `INSERT INTO pet_runtime_states (
      project_id, current_pose, target_pose, current_clip_id,
      queued_motion_keys_json, last_user_intent, last_updated_at
    ) VALUES (
      @projectId, @currentPose, @targetPose, @currentClipId,
      @queuedMotionKeysJson, @lastUserIntent, @lastUpdatedAt
    )
    ON CONFLICT(project_id) DO UPDATE SET
      current_pose = excluded.current_pose,
      target_pose = excluded.target_pose,
      current_clip_id = excluded.current_clip_id,
      queued_motion_keys_json = excluded.queued_motion_keys_json,
      last_user_intent = excluded.last_user_intent,
      last_updated_at = excluded.last_updated_at`
  ).run({
    projectId: state.projectId,
    currentPose: state.currentPose,
    targetPose: state.targetPose,
    currentClipId: state.currentClipId,
    queuedMotionKeysJson: JSON.stringify(state.queuedMotionKeys),
    lastUserIntent: state.lastUserIntent,
    lastUpdatedAt: state.lastUpdatedAt
  });

  return state;
}

function getWorldAssetForManifest(
  projectId: string,
  db: DatabaseClient,
  sceneClusterId?: string | null
): WorldAsset | null {
  if (sceneClusterId) {
    const row = db
      .prepare(
        `SELECT * FROM world_assets
         WHERE project_id = ?
           AND scene_cluster_id = ?
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(projectId, sceneClusterId) as WorldAssetRow | undefined;

    return row ? mapWorldAsset(row) : null;
  }

  const row = db
    .prepare(
      `SELECT * FROM world_assets
       WHERE project_id = ?
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(projectId) as WorldAssetRow | undefined;

  return row ? mapWorldAsset(row) : null;
}

function getSceneCluster(
  sceneClusterId: string,
  db: DatabaseClient
): SceneClusterRow | null {
  const row = db
    .prepare("SELECT * FROM scene_clusters WHERE id = ?")
    .get(sceneClusterId) as SceneClusterRow | undefined;

  return row ?? null;
}

function getExperienceSpaceSummaries(
  projectId: string,
  db: DatabaseClient,
  activeSceneClusterId: string | null
): ExperienceSpaceSummary[] {
  const clusters = listSceneClusters(projectId, db);
  const worldAssetsBySceneCluster = new Map(
    listWorldAssets(projectId, db).map((asset) => [asset.sceneClusterId, asset])
  );
  const primarySceneClusterId =
    listWorldAssets(projectId, db)[0]?.sceneClusterId ?? activeSceneClusterId;
  const orderedClusters = [
    ...clusters.filter((cluster) => cluster.id === activeSceneClusterId),
    ...clusters.filter(
      (cluster) =>
        cluster.id !== activeSceneClusterId && cluster.id === primarySceneClusterId
    ),
    ...clusters.filter(
      (cluster) =>
        cluster.id !== activeSceneClusterId && cluster.id !== primarySceneClusterId
    )
  ].slice(0, 1 + MAX_MANIFEST_ALTERNATE_SPACES);

  return orderedClusters.map((cluster) => {
    const asset = worldAssetsBySceneCluster.get(cluster.id) ?? null;
    const isReady = cluster.status === "ready" && Boolean(asset);

    return {
      sceneClusterId: cluster.id,
      label: cluster.label,
      status: getExperienceSpaceStatus(cluster.status, Boolean(asset)),
      progress: getExperienceSpaceProgress(cluster, Boolean(asset)),
      thumbnailUrl:
        asset?.thumbnailUrl ??
        asset?.panoUrl ??
        parseJsonArray(cluster.seed_image_urls_json)[0] ??
        null,
      active: cluster.id === activeSceneClusterId,
      canEnter: isReady
    };
  });
}

function listSceneClusters(
  projectId: string,
  db: DatabaseClient
): SceneClusterRow[] {
  return db
    .prepare(
      `SELECT *
       FROM scene_clusters
       WHERE project_id = ?
       ORDER BY created_at ASC`
    )
    .all(projectId) as SceneClusterRow[];
}

function listWorldAssets(projectId: string, db: DatabaseClient): WorldAsset[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM world_assets
       WHERE project_id = ?
       ORDER BY created_at ASC`
    )
    .all(projectId) as WorldAssetRow[];

  return rows.map(mapWorldAsset);
}

function getExperienceSpaceStatus(
  status: string,
  hasAsset: boolean
): ExperienceSpaceSummary["status"] {
  if (status === "failed") {
    return "failed";
  }

  if (status === "ready" && hasAsset) {
    return "ready";
  }

  if (status === "generating_seed" || status === "waiting_for_world") {
    return "generating";
  }

  return "pending";
}

function getExperienceSpaceProgress(
  cluster: SceneClusterRow,
  hasAsset: boolean
): number {
  if (cluster.status === "ready" && hasAsset) {
    return 100;
  }

  if (cluster.status === "failed") {
    return 100;
  }

  if (cluster.status === "waiting_for_world") {
    return 72;
  }

  if (cluster.status === "generating_seed") {
    const seedCount = parseJsonArray(cluster.seed_image_urls_json).length;
    return Math.min(62, 24 + seedCount * 18);
  }

  if (cluster.status === "selected") {
    return 16;
  }

  return 8;
}

function getProjectSelection(
  projectId: string,
  db: DatabaseClient
): {
  id: Project["id"];
  status: string;
  displayName: string | null;
  selectedPetId: string | null;
} | null {
  const row = db
    .prepare("SELECT id, status, display_name, selected_pet_id FROM projects WHERE id = ?")
    .get(projectId) as ProjectSelectionRow | undefined;

  return row
    ? {
        id: row.id,
        status: row.status,
        displayName: row.display_name,
        selectedPetId: row.selected_pet_id
      }
    : null;
}

function getSelectedPetProfile(
  projectId: string,
  selectedPetId: string | null,
  db: DatabaseClient
): PetProfile | null {
  if (selectedPetId) {
    const selectedRow = db
      .prepare("SELECT * FROM pet_profiles WHERE project_id = ? AND id = ?")
      .get(projectId, selectedPetId) as PetProfileRow | undefined;

    if (selectedRow) {
      return mapPetProfile(selectedRow);
    }
  }

  const row = db
    .prepare(
      `SELECT * FROM pet_profiles
       WHERE project_id = ?
       ORDER BY selection_confidence DESC, updated_at DESC
       LIMIT 1`
    )
    .get(projectId) as PetProfileRow | undefined;

  return row ? mapPetProfile(row) : null;
}

function getMotionClips(
  projectId: string,
  petProfileId: string,
  db: DatabaseClient
): MotionClip[] {
  const rows = db
    .prepare(
      `SELECT * FROM motion_clips
       WHERE project_id = ? AND pet_profile_id = ?
       ORDER BY motion_key ASC, updated_at DESC`
    )
    .all(projectId, petProfileId) as MotionClipRow[];

  return rows.map(mapMotionClip);
}

function getPetRuntimeState(
  projectId: string,
  db: DatabaseClient
): PetRuntimeState | null {
  const row = db
    .prepare("SELECT * FROM pet_runtime_states WHERE project_id = ?")
    .get(projectId) as PetRuntimeStateRow | undefined;

  return row
    ? {
        projectId: row.project_id,
        currentPose: row.current_pose,
        targetPose: row.target_pose,
        currentClipId: row.current_clip_id,
        queuedMotionKeys: parseJsonArray(row.queued_motion_keys_json),
        lastUserIntent: row.last_user_intent,
        lastUpdatedAt: row.last_updated_at
      }
    : null;
}

function mapWorldAsset(row: WorldAssetRow): WorldAsset {
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
      ? JSON.parse(row.initial_camera_pose_json)
      : null
  };
}

function mapPetProfile(row: PetProfileRow): PetProfile {
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

function sanitizePetProfileForClient(petProfile: PetProfile): PetProfile {
  return {
    ...petProfile,
    sourceCandidateIds: [],
    clarificationAnswer: null
  };
}

function mapMotionClip(row: MotionClipRow): MotionClip {
  return {
    id: row.id,
    projectId: row.project_id,
    petProfileId: row.pet_profile_id,
    motionKey: row.motion_key,
    fromState: row.from_state,
    toState: row.to_state,
    prompt: row.prompt,
    keyframeImageUrls: parseJsonArray(row.keyframe_image_urls_json),
    rawVideoUrl: row.raw_video_url,
    processedVideoUrl: row.processed_video_url,
    alphaVideoUrl: row.alpha_video_url,
    durationMs: row.duration_ms,
    loopable: row.loopable === 1,
    qualityScore: row.quality_score,
    providerOperationId: row.provider_operation_id,
    providerName: row.provider_name,
    providerStatus: row.provider_status,
    providerErrorMessage: row.provider_error_message,
    postprocess: parsePostprocess(row.postprocess_json),
    status: row.status
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
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
