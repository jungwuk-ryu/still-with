import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectRecord, openDatabase, type DatabaseClient } from "@/server/db";
import { getExperienceManifest } from "./experience-manifest";

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

async function createTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-experience-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

describe("experience manifest", () => {
  it("uses the selected pet profile and scopes motion clips to that pet", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const now = new Date().toISOString();

    insertPetProfile(db, project.id, "pet-a", 0.4, now);
    insertPetProfile(db, project.id, "pet-b", 0.9, now);
    db.prepare("UPDATE projects SET selected_pet_id = ? WHERE id = ?").run(
      "pet-a",
      project.id
    );
    insertMotionClip(db, project.id, "pet-a", "idle", "/pet-a.mp4", now);
    insertMotionClip(db, project.id, "pet-b", "idle", "/pet-b.mp4", now);

    const manifest = getExperienceManifest(project.id, db);

    expect(manifest.pet.profile?.id).toBe("pet-a");
    expect(manifest.pet.motionClips).toHaveLength(1);
    expect(manifest.pet.motionClips[0]?.petProfileId).toBe("pet-a");
    expect(manifest.pet.idleVideoUrl).toBe("/pet-a.mp4");
  });
});

function insertPetProfile(
  db: DatabaseClient,
  projectId: string,
  petId: string,
  confidence: number,
  now: string
) {
  db.prepare(
    `INSERT INTO pet_profiles (
      id, project_id, source_candidate_ids_json, species, name,
      trait_summary, distinctive_markings_json, face_description,
      body_description, accessories_json, selection_confidence,
      clarification_required, clarification_answer, created_at, updated_at
    ) VALUES (
      @petId, @projectId, '["candidate-1"]', 'cat', null,
      'A remembered pet.', '[]', null,
      null, '[]', @confidence,
      0, 'private answer', @now, @now
    )`
  ).run({ petId, projectId, confidence, now });
}

function insertMotionClip(
  db: DatabaseClient,
  projectId: string,
  petId: string,
  motionKey: string,
  videoUrl: string,
  now: string
) {
  db.prepare(
    `INSERT INTO motion_clips (
      id, project_id, pet_profile_id, motion_key, from_state, to_state,
      prompt, keyframe_image_urls_json, raw_video_url, processed_video_url,
      alpha_video_url, duration_ms, loopable, quality_score, status,
      created_at, updated_at
    ) VALUES (
      @id, @projectId, @petId, @motionKey, 'stand', 'stand',
      'idle', '[]', null, @videoUrl,
      null, 1200, 1, 0.9, 'ready',
      @now, @now
    )`
  ).run({
    id: `${petId}-${motionKey}`,
    projectId,
    petId,
    motionKey,
    videoUrl,
    now
  });
}
