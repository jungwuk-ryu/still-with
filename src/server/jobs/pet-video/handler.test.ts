import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectRecord,
  openDatabase,
  updateProjectSelectedPet,
  type DatabaseClient
} from "@/server/db";
import { createGenerationJob } from "@/server/jobs";
import { LocalStorageDriver } from "@/server/storage";
import type { JsonValue, PetProfile } from "@/types";
import type { SoraProvider } from "@/server/providers";
import { listMotionClipRecords } from "@/server/motion";
import { upsertPetProfileRecord } from "@/server/jobs/pet-analysis/pet-profile-repository";
import { handlePetVideoJob } from "./handler";

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

describe("handlePetVideoJob", () => {
  it("attempts Sora first and creates a fallback still animation when video generation fails", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    const calls: string[] = [];
    const soraProvider: SoraProvider = {
      async createMotionClip(input) {
        calls.push(input.motionKey);
        throw new Error("Sora unavailable for test");
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        throw new Error("not reached");
      }
    };
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "pet-video",
        payload: {
          petProfile: petProfile as unknown as JsonValue,
          motionKeys: ["turn_360"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      soraProvider,
      pollAttempts: 0
    });
    const clips = listMotionClipRecords(project.id, db);
    const fallbackManifest = await storage.getObject(
      `projects/${project.id}/pet/fallback/turn_360.json`
    );

    expect(calls).toEqual(["turn_360"]);
    expect(clips).toHaveLength(1);
    expect(clips[0].status).toBe("ready");
    expect(clips[0].rawVideoUrl).toBeNull();
    expect(clips[0].processedVideoUrl).toContain(
      `/api/storage/projects/${project.id}/pet/fallback/turn_360.json`
    );
    expect(clips[0].providerStatus).toBe("failed");
    expect(clips[0].qualityScore).toBeGreaterThanOrEqual(0.72);
    expect(JSON.parse(fallbackManifest.body.toString("utf8"))).toMatchObject({
      kind: "fallback-still-animation",
      motionKey: "turn_360"
    });
    expect(result).toMatchObject({
      sora: {
        attempted: true,
        available: false,
        fallbackCount: 1
      }
    });
  });

  it("creates a demo-safe generated fallback poster when keyframes are missing", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    const soraProvider: SoraProvider = {
      async createMotionClip() {
        throw new Error("Sora unavailable for test");
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        throw new Error("not reached");
      }
    };
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "pet-video",
        payload: {
          petProfile: petProfile as unknown as JsonValue,
          motionKeys: ["look_at_camera"]
        }
      },
      db
    );

    await handlePetVideoJob(job, {
      db,
      storage,
      soraProvider,
      pollAttempts: 0
    });
    const clips = listMotionClipRecords(project.id, db);
    const fallbackManifest = JSON.parse(
      (
        await storage.getObject(
          `projects/${project.id}/pet/fallback/look_at_camera.json`
        )
      ).body.toString("utf8")
    ) as { stillImageUrl: string };

    expect(clips[0].status).toBe("ready");
    expect(fallbackManifest.stillImageUrl).toContain(
      `/api/storage/projects/${project.id}/pet/fallback/look_at_camera-poster.svg`
    );
  });

  it("fails quality when a fallback manifest points to a missing poster asset", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    await storage.putObject({
      key: `projects/${project.id}/pet/fallback/look_at_camera.json`,
      body: JSON.stringify({
        kind: "fallback-still-animation",
        stillImageUrl: `/api/storage/projects/${project.id}/pet/fallback/missing-poster.svg`
      }),
      contentType: "application/json"
    });
    const { upsertMotionClipRecord } = await import("@/server/motion");
    const { handleQualityEvaluationJob } = await import(
      "@/server/jobs/quality-evaluation/handler"
    );
    const clip = upsertMotionClipRecord(
      {
        projectId: project.id,
        petProfileId: petProfile.id,
        motionKey: "look_at_camera",
        fromState: "stand",
        toState: "stand",
        prompt:
          "one selected pet only. no people. no other animals. no props. no complex background.",
        processedVideoUrl: `/api/storage/projects/${project.id}/pet/fallback/look_at_camera.json`,
        durationMs: 3_000,
        loopable: false,
        postprocess: {
          chromaKeyColor: "green",
          alphaStrategy: "fallback-still",
          shaderUniforms: {
            keyColor: [0, 1, 0],
            similarity: 0.34,
            smoothness: 0.08,
            spill: 0.12
          }
        },
        status: "processing"
      },
      db
    );
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "quality-evaluation",
        payload: {
          clipId: clip.id,
          petProfile: petProfile as unknown as JsonValue
        }
      },
      db
    );

    const result = await handleQualityEvaluationJob(job, { db, storage });
    const [updated] = listMotionClipRecords(project.id, db);

    expect(result).toMatchObject({ passed: false });
    expect(updated.status).toBe("failed");
  });
});

function createTestPetProfile(projectId: string): PetProfile {
  return {
    id: "pet-profile-1",
    projectId,
    sourceCandidateIds: ["candidate-1"],
    species: "dog",
    name: null,
    traitSummary: "small white dog with brown ears and a compact body",
    distinctiveMarkings: ["brown ears", "white muzzle"],
    faceDescription: "soft face with dark eyes",
    bodyDescription: "small compact body with short white coat",
    accessories: [],
    selectionConfidence: 0.92,
    clarificationRequired: false,
    clarificationAnswer: null
  };
}
