import type { DatabaseClient } from "@/server/db";
import { getDatabase } from "@/server/db";
import type { PetRuntimeState } from "@/types";
import {
  createInitialPetRuntimeState,
  enqueueMotionPlan,
  type EnqueueMotionPlanOptions
} from "@/pet/runtime-state";
import { planPetTransition } from "@/pet/transition-planner";

interface PetRuntimeStateRow {
  project_id: string;
  current_pose: string;
  target_pose: string | null;
  current_clip_id: string | null;
  queued_motion_keys_json: string;
  last_user_intent: string | null;
  last_updated_at: string;
}

export function getPetRuntimeStateRecord(
  projectId: string,
  db: DatabaseClient = getDatabase()
): PetRuntimeState | null {
  const row = db
    .prepare("SELECT * FROM pet_runtime_states WHERE project_id = ?")
    .get(projectId) as PetRuntimeStateRow | undefined;

  return row ? mapPetRuntimeStateRow(row) : null;
}

export function getOrCreatePetRuntimeStateRecord(
  projectId: string,
  db: DatabaseClient = getDatabase()
): PetRuntimeState {
  const existing = getPetRuntimeStateRecord(projectId, db);

  if (existing) {
    return existing;
  }

  return upsertPetRuntimeStateRecord(createInitialPetRuntimeState(projectId), db);
}

export function upsertPetRuntimeStateRecord(
  state: PetRuntimeState,
  db: DatabaseClient = getDatabase()
): PetRuntimeState {
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
    ...state,
    queuedMotionKeysJson: JSON.stringify(state.queuedMotionKeys)
  });

  return state;
}

export function enqueuePetRuntimeCommand(
  projectId: string,
  command: string,
  options: EnqueueMotionPlanOptions = {},
  db: DatabaseClient = getDatabase()
): PetRuntimeState {
  const current = getOrCreatePetRuntimeStateRecord(projectId, db);
  const plan = planPetTransition({
    currentPose: current.currentPose,
    userCommand: command
  });
  const next = enqueueMotionPlan(current, plan, options);

  return upsertPetRuntimeStateRecord(next, db);
}

function mapPetRuntimeStateRow(row: PetRuntimeStateRow): PetRuntimeState {
  return {
    projectId: row.project_id,
    currentPose: row.current_pose,
    targetPose: row.target_pose,
    currentClipId: row.current_clip_id,
    queuedMotionKeys: parseStringArray(row.queued_motion_keys_json),
    lastUserIntent: row.last_user_intent,
    lastUpdatedAt: row.last_updated_at
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
