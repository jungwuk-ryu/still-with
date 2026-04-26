import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectRecord, openDatabase, updateProjectSelectedPet } from "@/server/db";
import type { DatabaseClient } from "@/server/db";
import {
  REQUIRED_EXPERIENCE_AUDIO_ASSETS,
  upsertAudioAssetRecord
} from "@/server/audio";
import { upsertPetProfileRecord } from "@/server/jobs/pet-analysis/pet-profile-repository";
import { upsertMotionClipRecord } from "@/server/motion";
import { PET_MOTION_DEFINITIONS, REQUIRED_MOTION_KEYS } from "@/pet/motion-set";
import type { PetProfile } from "@/types";
import { markProjectReadyIfAssetsComplete } from "./pipeline";

let db: DatabaseClient | null = null;
let tmpDir: string | null = null;

afterEach(async () => {
  db?.close();
  db = null;

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("project generation pipeline", () => {
  it("marks the project ready only after world and required pet motion assets exist", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pipeline-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const project = createProjectRecord({ status: "preparing_pet" }, db);
    const petProfile = createPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);

    expect(markProjectReadyIfAssetsComplete(project.id, db)).toBeNull();

    insertWorldAsset(db, project.id);
    for (const motionKey of REQUIRED_MOTION_KEYS) {
      const definition = PET_MOTION_DEFINITIONS[motionKey];
      upsertMotionClipRecord(
        {
          projectId: project.id,
          petProfileId: petProfile.id,
          motionKey,
          fromState: definition.fromState,
          toState: definition.toState,
          prompt: "one selected pet only. no people. no other animals. no props. no complex background.",
          processedVideoUrl: `/api/storage/projects/${project.id}/pet/${motionKey}.mp4`,
          durationMs: definition.durationMs,
          loopable: definition.loopable,
          status: "ready"
        },
        db
      );
    }

    const waitingForAudioProject = markProjectReadyIfAssetsComplete(project.id, db);
    const audioJob = db
      .prepare("SELECT type, status FROM generation_jobs WHERE project_id = ?")
      .get(project.id) as { type: string; status: string } | undefined;

    expect(waitingForAudioProject).toBeNull();
    expect(audioJob).toMatchObject({
      type: "elevenlabs-audio",
      status: "queued"
    });

    for (const asset of REQUIRED_EXPERIENCE_AUDIO_ASSETS) {
      upsertAudioAssetRecord(
        {
          projectId: project.id,
          kind: asset.kind,
          assetKey: asset.assetKey,
          prompt: "quiet generated audio",
          audioUrl: `/api/storage/projects/${project.id}/audio/${asset.assetKey}.mp3`,
          providerName: "elevenlabs",
          providerStatus: "succeeded",
          status: "ready"
        },
        db
      );
    }

    const readyProject = markProjectReadyIfAssetsComplete(project.id, db);

    expect(readyProject?.status).toBe("ready");
    expect(readyProject?.currentStage).toBe("The door is open");
    expect(readyProject?.completedAt).toEqual(expect.any(String));
  });
});

function insertWorldAsset(db: DatabaseClient, projectId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scene_clusters (
      id, project_id, label, source_image_ids_json, representative_image_ids_json,
      spatial_prompt, seed_image_urls_json, world_labs_operation_id, world_id,
      status, created_at, updated_at
    ) VALUES (
      'scene-1', @projectId, 'Living room', '[]', '[]',
      'A soft room', '[]', null, 'world-1',
      'ready', @now, @now
    )`
  ).run({ projectId, now });
  db.prepare(
    `INSERT INTO world_assets (
      id, project_id, scene_cluster_id, world_id, spz_url_100k, spz_url_500k,
      spz_url_full_res, collider_mesh_url, pano_url, thumbnail_url,
      ground_plane_offset, initial_camera_pose_json, created_at, updated_at
    ) VALUES (
      'world-asset-1', @projectId, 'scene-1', 'world-1', null, '/world.spz',
      null, '/world.glb', null, '/thumb.jpg',
      0, null, @now, @now
    )`
  ).run({ projectId, now });
}

function createPetProfile(projectId: string): PetProfile {
  return {
    id: "pet-profile-1",
    projectId,
    sourceCandidateIds: ["candidate-1"],
    species: "dog",
    name: null,
    traitSummary: "small white dog with brown ears",
    distinctiveMarkings: ["brown ears"],
    faceDescription: "soft face",
    bodyDescription: "small body",
    accessories: [],
    selectionConfidence: 0.93,
    clarificationRequired: false,
    clarificationAnswer: null
  };
}
