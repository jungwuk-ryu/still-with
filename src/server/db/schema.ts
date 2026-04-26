export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  current_stage TEXT,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 7,
  debug_progress_percent INTEGER NOT NULL DEFAULT 0,
  selected_pet_id TEXT,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS uploaded_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  original_url TEXT NOT NULL,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  mime_type TEXT NOT NULL,
  exif_metadata_json TEXT,
  upload_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pet_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_candidate_ids_json TEXT NOT NULL DEFAULT '[]',
  species TEXT,
  name TEXT,
  trait_summary TEXT NOT NULL,
  distinctive_markings_json TEXT NOT NULL DEFAULT '[]',
  face_description TEXT,
  body_description TEXT,
  accessories_json TEXT NOT NULL DEFAULT '[]',
  selection_confidence REAL NOT NULL DEFAULT 0,
  clarification_required INTEGER NOT NULL DEFAULT 0,
  clarification_answer TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scene_clusters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  source_image_ids_json TEXT NOT NULL DEFAULT '[]',
  representative_image_ids_json TEXT NOT NULL DEFAULT '[]',
  spatial_prompt TEXT,
  seed_image_urls_json TEXT NOT NULL DEFAULT '[]',
  seed_prompt_version TEXT,
  world_labs_operation_id TEXT,
  world_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scene_cluster_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  spz_url_100k TEXT,
  spz_url_500k TEXT,
  spz_url_full_res TEXT,
  collider_mesh_url TEXT,
  pano_url TEXT,
  thumbnail_url TEXT,
  ground_plane_offset REAL NOT NULL DEFAULT 0,
  initial_camera_pose_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(scene_cluster_id) REFERENCES scene_clusters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS motion_clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  pet_profile_id TEXT NOT NULL,
  motion_key TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  prompt TEXT NOT NULL,
  keyframe_image_urls_json TEXT NOT NULL DEFAULT '[]',
  raw_video_url TEXT,
  processed_video_url TEXT,
  alpha_video_url TEXT,
  duration_ms INTEGER,
  loopable INTEGER NOT NULL DEFAULT 0,
  quality_score REAL,
  provider_operation_id TEXT,
  provider_name TEXT,
  provider_status TEXT,
  provider_error_message TEXT,
  postprocess_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(pet_profile_id) REFERENCES pet_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pet_runtime_states (
  project_id TEXT PRIMARY KEY,
  current_pose TEXT NOT NULL,
  target_pose TEXT,
  current_clip_id TEXT,
  queued_motion_keys_json TEXT NOT NULL DEFAULT '[]',
  last_user_intent TEXT,
  last_updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audio_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  audio_url TEXT,
  content_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  duration_ms INTEGER,
  provider_name TEXT,
  provider_status TEXT,
  provider_error_message TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, kind, asset_key)
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_email_notifications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  status TEXT NOT NULL,
  send_attempts INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_attempt_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_uploaded_images_project ON uploaded_images(project_id, upload_order);
CREATE INDEX IF NOT EXISTS idx_scene_clusters_project ON scene_clusters(project_id, status);
CREATE INDEX IF NOT EXISTS idx_motion_clips_project ON motion_clips(project_id, motion_key);
CREATE INDEX IF NOT EXISTS idx_audio_assets_project ON audio_assets(project_id, kind, asset_key);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_claimable
  ON generation_jobs(status, run_after, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_project
  ON generation_jobs(project_id, status, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_email_notifications_unique
  ON project_email_notifications(project_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_project_email_notifications_claimable
  ON project_email_notifications(project_id, status, requested_at);
`;
