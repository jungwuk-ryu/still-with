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
import type { SoraProvider, VeoProvider } from "@/server/providers";
import { listMotionClipRecords, upsertMotionClipRecord } from "@/server/motion";
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
  it("uses Sora when Veo is not configured and creates a fallback still animation when video generation fails", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    const calls: string[] = [];
    const soraProvider: SoraProvider = {
      providerName: "sora",
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
      veoProvider: null,
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
    expect(clips[0].providerName).toBe("sora");
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
      },
      fallback: {
        count: 1,
        failures: [
          {
            motionKey: "turn_360",
            providerName: "sora"
          }
        ]
      }
    });
  });

  it("redacts provider secrets from returned fallback failures", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    const leakedGoogleKey = "AIzaSyD000000000000000000000000000000000";
    const leakedOpenAIKey = "sk-0000000000000000000000000000000000000000";
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip() {
        throw new Error(
          `failed x-goog-api-key=${leakedGoogleKey} key=${leakedGoogleKey} Bearer ${leakedOpenAIKey}`
        );
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
          motionKeys: ["stand_idle"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider: null,
      pollAttempts: 0
    });
    const clips = listMotionClipRecords(project.id, db);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(leakedGoogleKey);
    expect(serialized).not.toContain(leakedOpenAIKey);
    expect(clips[0].providerErrorMessage).not.toContain(leakedGoogleKey);
    expect(clips[0].providerErrorMessage).not.toContain(leakedOpenAIKey);
    expect(result).toMatchObject({
      veo: {
        attempted: true,
        fallbackCount: 1
      },
      fallback: {
        count: 1,
        failures: [
          {
            providerName: "veo"
          }
        ]
      }
    });
  });

  it("prioritizes Veo over Sora when Veo generation succeeds", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    await seedMotionKeyframe(storage, project.id, petProfile.id, "stand_idle");
    const calls: string[] = [];
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip(input) {
        calls.push(`veo:${input.motionKey}`);
        expect(input.keyframeImageUrls[0]).toMatch(
          /^data:image\/svg\+xml;base64,/
        );
        return {
          operationId: "models/veo-3.1-generate-preview/operations/test-veo",
          status: "succeeded",
          motionClip: null,
          raw: {}
        };
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        return Buffer.from("fake veo mp4");
      }
    };
    const soraProvider: SoraProvider = {
      providerName: "sora",
      async createMotionClip() {
        calls.push("sora");
        throw new Error("Sora should not be called when Veo succeeds");
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
          motionKeys: ["stand_idle"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider,
      pollAttempts: 0
    });
    const clips = listMotionClipRecords(project.id, db);

    expect(calls).toEqual(["veo:stand_idle"]);
    expect(clips[0].status).toBe("ready");
    expect(clips[0].providerName).toBe("veo");
    expect(clips[0].providerStatus).toBe("succeeded");
    expect(clips[0].rawVideoUrl).toContain("/pet/videos/stand_idle-veo-");
    expect(result).toMatchObject({
      videoProviderPriority: ["veo", "sora", "fallback"],
      veo: {
        attempted: true,
        available: true,
        completedCount: 1
      },
      sora: {
        attempted: false,
        completedCount: 0
      },
      fallback: {
        count: 0
      }
    });
  });

  it("attempts remote motion generation for every requested clip by default", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    await seedMotionKeyframe(storage, project.id, petProfile.id, "stand_idle");
    await seedMotionKeyframe(storage, project.id, petProfile.id, "sit");
    await seedMotionKeyframe(storage, project.id, petProfile.id, "walk_small");
    const calls: string[] = [];
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip(input) {
        calls.push(input.motionKey);
        return {
          operationId: `operation-${input.motionKey}`,
          status: "succeeded",
          motionClip: null,
          raw: {}
        };
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        return Buffer.from("fake veo mp4");
      }
    };
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "pet-video",
        payload: {
          petProfile: petProfile as unknown as JsonValue,
          motionKeys: ["stand_idle", "sit", "walk_small"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider: null,
      pollAttempts: 0
    });
    const clips = Object.fromEntries(
      listMotionClipRecords(project.id, db).map((clip) => [
        clip.motionKey,
        clip
      ])
    );

    expect(calls).toEqual(["stand_idle", "sit", "walk_small"]);
    expect(clips.stand_idle.status).toBe("ready");
    expect(clips.stand_idle.providerName).toBe("veo");
    expect(clips.sit.status).toBe("ready");
    expect(clips.sit.providerName).toBe("veo");
    expect(clips.walk_small.status).toBe("ready");
    expect(clips.walk_small.providerName).toBe("veo");
    expect(result).toMatchObject({
      veo: {
        attempted: true,
        completedCount: 3,
        failedCount: 0
      },
      fallback: {
        count: 0
      }
    });
  });

  it("honors an explicit remote motion generation limit", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    await seedMotionKeyframe(storage, project.id, petProfile.id, "stand_idle");
    await seedMotionKeyframe(storage, project.id, petProfile.id, "sit");
    await seedMotionKeyframe(storage, project.id, petProfile.id, "walk_small");
    const calls: string[] = [];
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip(input) {
        calls.push(input.motionKey);
        return {
          operationId: `operation-${input.motionKey}`,
          status: "succeeded",
          motionClip: null,
          raw: {}
        };
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        return Buffer.from("fake veo mp4");
      }
    };
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "pet-video",
        payload: {
          petProfile: petProfile as unknown as JsonValue,
          motionKeys: ["stand_idle", "sit", "walk_small"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider: null,
      pollAttempts: 0,
      remoteMotionAttemptLimit: 2
    });
    const clips = Object.fromEntries(
      listMotionClipRecords(project.id, db).map((clip) => [
        clip.motionKey,
        clip
      ])
    );

    expect(calls).toEqual(["stand_idle", "sit"]);
    expect(clips.walk_small.providerName).toBe("fallback");
    expect(clips.walk_small.providerErrorMessage).toContain(
      "remote pet motion generation is limited"
    );
    expect(result).toMatchObject({
      veo: {
        attempted: true,
        completedCount: 2,
        failedCount: 0
      },
      fallback: {
        count: 1,
        failures: [
          {
            motionKey: "walk_small",
            providerName: "fallback"
          }
        ]
      }
    });
  });

  it("aborts slow remote providers and falls back", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    let aborted = false;
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip(input) {
        return new Promise((resolve, reject) => {
          input.context?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("aborted by signal"));
            },
            { once: true }
          );
        });
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
          motionKeys: ["stand_idle"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider: null,
      remoteAttemptTimeoutMs: 25
    });
    const [clip] = listMotionClipRecords(project.id, db);

    expect(aborted).toBe(true);
    expect(clip.status).toBe("ready");
    expect(clip.providerName).toBe("veo");
    expect(clip.providerStatus).toBe("failed");
    expect(clip.providerErrorMessage).toContain(
      "veo motion generation timed out"
    );
    expect(clip.rawVideoUrl).toBeNull();
    expect(clip.processedVideoUrl).toContain("/pet/fallback/stand_idle.json");
    expect(result).toMatchObject({
      veo: {
        attempted: true,
        failedCount: 1,
        fallbackCount: 1
      },
      fallback: {
        count: 1
      }
    });
  });

  it("falls through to Sora when Veo generation fails", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    await seedMotionKeyframe(storage, project.id, petProfile.id, "look_at_camera");
    const calls: string[] = [];
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip() {
        calls.push("veo");
        throw new Error("Veo unavailable for test");
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        throw new Error("not reached");
      }
    };
    const soraProvider: SoraProvider = {
      providerName: "sora",
      async createMotionClip(input) {
        calls.push(`sora:${input.motionKey}`);
        return {
          operationId: "video-test-sora",
          status: "succeeded",
          motionClip: null,
          raw: {}
        };
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        return Buffer.from("fake sora mp4");
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

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider,
      pollAttempts: 0
    });
    const clips = listMotionClipRecords(project.id, db);

    expect(calls).toEqual(["veo", "sora:look_at_camera"]);
    expect(clips[0].status).toBe("ready");
    expect(clips[0].providerName).toBe("sora");
    expect(clips[0].providerStatus).toBe("succeeded");
    expect(result).toMatchObject({
      veo: {
        attempted: true,
        available: false,
        failedCount: 1
      },
      sora: {
        attempted: true,
        available: true,
        completedCount: 1,
        fallbackCount: 0
      },
      fallback: {
        count: 0
      }
    });
  });

  it("falls back to static animation when a remote video fails the quality gate", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-video-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const project = createProjectRecord({}, db);
    const petProfile = createTestPetProfile(project.id);
    upsertPetProfileRecord(petProfile, db);
    updateProjectSelectedPet(project.id, petProfile.id, db);
    const veoProvider: VeoProvider = {
      providerName: "veo",
      async createMotionClip() {
        return {
          operationId: "models/veo-3.1-generate-preview/operations/quality-fail",
          status: "succeeded",
          motionClip: null,
          raw: {}
        };
      },
      async getMotionClip() {
        throw new Error("not reached");
      },
      async downloadMotionClipContent() {
        return Buffer.from("fake veo mp4");
      }
    };
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "pet-video",
        payload: {
          petProfile: petProfile as unknown as JsonValue,
          motionKeys: ["walk_small"]
        }
      },
      db
    );

    const result = await handlePetVideoJob(job, {
      db,
      storage,
      veoProvider,
      soraProvider: null,
      pollAttempts: 0
    });
    const clips = listMotionClipRecords(project.id, db);

    expect(clips[0].status).toBe("ready");
    expect(clips[0].providerName).toBe("veo");
    expect(clips[0].providerStatus).toBe("failed");
    expect(clips[0].processedVideoUrl).toContain(
      `/api/storage/projects/${project.id}/pet/fallback/walk_small.json`
    );
    expect(result).toMatchObject({
      veo: {
        attempted: true,
        available: false,
        failedCount: 1,
        fallbackCount: 1
      },
      sora: {
        attempted: false,
        fallbackCount: 0
      },
      fallback: {
        count: 1,
        failures: [
          {
            motionKey: "walk_small",
            providerName: "veo"
          }
        ]
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
      providerName: "sora",
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
      veoProvider: null,
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

async function seedMotionKeyframe(
  storage: LocalStorageDriver,
  projectId: string,
  petProfileId: string,
  motionKey: "stand_idle" | "sit" | "look_at_camera" | "walk_small"
): Promise<string> {
  const stored = await storage.putObject({
    key: `projects/${projectId}/pet/keyframes/${motionKey}.svg`,
    body: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#00ff00"/><circle cx="640" cy="360" r="120" fill="#111"/></svg>'
    ),
    contentType: "image/svg+xml"
  });
  upsertMotionClipRecord(
    {
      projectId,
      petProfileId,
      motionKey,
      fromState: "stand",
      toState: "stand",
      prompt: "seed keyframe",
      keyframeImageUrls: [stored.url],
      durationMs: 4_000,
      loopable: true,
      status: "generating_keyframes"
    },
    db ?? undefined
  );

  return stored.url;
}

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
