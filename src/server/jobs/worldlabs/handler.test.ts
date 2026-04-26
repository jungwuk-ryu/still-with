import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectRecord, openDatabase, type DatabaseClient } from "@/server/db";
import { createGenerationJob } from "@/server/jobs/repository";
import {
  createSceneClusterRecord,
  getSceneClusterRecord,
  getWorldAssetRecord
} from "@/server/assets/world-assets";
import type {
  WorldLabsOperation,
  WorldLabsProvider
} from "@/server/providers";
import type { WorldAsset } from "@/types";
import { createWorldLabsGenerationHandler } from "./handler";

let db: DatabaseClient | null = null;
let tmpDir: string | null = null;
let previousStorageDir: string | undefined;

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  db?.close();
  db = null;

  if (previousStorageDir === undefined) {
    delete process.env.LOCAL_STORAGE_DIR;
  } else {
    process.env.LOCAL_STORAGE_DIR = previousStorageDir;
  }

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("worldlabs generation handler", () => {
  it("creates a World Labs operation and enqueues polling atomically", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db);
    const provider = createProviderStub({
      async createWorld() {
        return operation("operation-1", "running", "world-1");
      }
    });
    const handler = createWorldLabsGenerationHandler({
      db,
      provider,
      initialPollDelayMs: 0
    });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          seedImages: [
            { url: "/api/storage/projects/project/space-seeds/front.png", view: "front" },
            { url: "/api/storage/projects/project/space-seeds/back.png", view: "back" }
          ],
          inputMode: "multi-image"
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      operationId: "operation-1",
      nextPollInMs: 0
    });
    expect(getSceneClusterRecord(sceneClusterId, db)?.worldLabsOperationId).toBe(
      "operation-1"
    );
    const pollJob = db
      .prepare(
        "SELECT payload_json FROM generation_jobs WHERE type = 'worldlabs-generation' AND id != ?"
      )
      .get(job.id) as { payload_json: string };
    expect(JSON.parse(pollJob.payload_json)).toMatchObject({
      sceneClusterId,
      operationId: "operation-1",
      pollAttempt: 1
    });
  });

  it("marks the scene failed when initial World Labs creation fails", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db);
    const provider = createProviderStub({
      async createWorld() {
        throw new Error("World Labs request failed with HTTP 503.");
      }
    });
    const handler = createWorldLabsGenerationHandler({
      db,
      provider,
      initialPollDelayMs: 0
    });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          seedImages: [
            { url: "/api/storage/projects/project/space-seeds/front.png", view: "front" },
            { url: "/api/storage/projects/project/space-seeds/back.png", view: "back" }
          ],
          inputMode: "multi-image"
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs request failed with HTTP 503."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      status: "failed",
      worldLabsOperationId: null
    });
    const queuedPolls = db
      .prepare(
        "SELECT COUNT(*) AS count FROM generation_jobs WHERE type = 'worldlabs-generation' AND id != ?"
      )
      .get(job.id) as { count: number };
    expect(queuedPolls.count).toBe(0);
  });

  it("creates a new World Labs operation for a failed scene with a stale operation id", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "old-operation",
      status: "failed"
    });
    let createWorldCalled = false;
    const provider = createProviderStub({
      async createWorld() {
        createWorldCalled = true;
        return operation("new-operation", "running", "new-world");
      },
      async getOperation() {
        throw new Error("stale operation should not be polled");
      }
    });
    const handler = createWorldLabsGenerationHandler({
      db,
      provider,
      initialPollDelayMs: 0
    });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          seedImages: [
            { url: "/api/storage/projects/project/space-seeds/front.png", view: "front" },
            { url: "/api/storage/projects/project/space-seeds/back.png", view: "back" }
          ],
          inputMode: "multi-image"
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      operationId: "new-operation",
      status: "running"
    });
    expect(createWorldCalled).toBe(true);
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      worldLabsOperationId: "new-operation",
      worldId: "new-world",
      status: "waiting_for_world"
    });
  });

  it("polls a running operation and enqueues the next poll", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "running", "world-1");
      }
    });
    const handler = createWorldLabsGenerationHandler({
      db,
      provider,
      initialPollDelayMs: 0
    });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      status: "running",
      pollAttempt: 2
    });
    const pollJob = db
      .prepare(
        "SELECT payload_json, run_after FROM generation_jobs WHERE type = 'worldlabs-generation' AND id != ?"
      )
      .get(job.id) as { payload_json: string; run_after: string };
    expect(JSON.parse(pollJob.payload_json)).toMatchObject({
      operationId: "operation-1",
      pollAttempt: 2
    });
    expect(new Date(pollJob.run_after).getTime()).toBe(
      new Date("2026-04-26T00:00:15.000Z").getTime()
    );
  });

  it("marks the scene failed when operation polling throws", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        throw new Error("World Labs request failed with HTTP 503.");
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs request failed with HTTP 503."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe("failed");
  });

  it("keeps the scene retryable when operation polling throws before final attempt", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        throw new Error("World Labs request failed with HTTP 503.");
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        }
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs request failed with HTTP 503."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe(
      "waiting_for_world"
    );
  });

  it("persists a complete WorldAsset manifest when polling succeeds", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return completeWorldAsset(projectId, sceneClusterId);
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      worldId: "world-1",
      worldAssetId: "world-asset-world-1",
      renderMode: "spz"
    });
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe("ready");
    expect(getWorldAssetRecord("world-asset-world-1", db)).toMatchObject({
      spzUrl500k: "https://cdn.example.com/500k.spz",
      colliderMeshUrl: "https://cdn.example.com/collider.glb",
      panoUrl: "https://cdn.example.com/pano.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg"
    });
  });

  it("stores a panorama fallback asset when SPZ tiers are missing", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return {
          ...completeWorldAsset(projectId, sceneClusterId),
          spzUrl100k: null,
          spzUrl500k: null,
          spzUrlFullRes: null
        };
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      renderMode: "panorama"
    });
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe("ready");
    expect(getWorldAssetRecord("world-asset-world-1", db)).toMatchObject({
      spzUrl500k: null,
      panoUrl: "https://cdn.example.com/pano.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg"
    });
  });

  it("fails when a completed world has no renderable asset", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return {
          ...completeWorldAsset(projectId, sceneClusterId),
          spzUrl100k: null,
          spzUrl500k: null,
          spzUrlFullRes: null,
          panoUrl: null,
          thumbnailUrl: null
        };
      }
    });
    db.prepare("UPDATE scene_clusters SET seed_image_urls_json = '[]' WHERE id = ?").run(
      sceneClusterId
    );
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs completed world did not include a renderable asset."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      status: "failed",
      worldId: "world-1"
    });
  });

  it("falls back to panorama when an SPZ world is missing its collider mesh", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return {
          ...completeWorldAsset(projectId, sceneClusterId),
          colliderMeshUrl: null
        };
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      renderMode: "panorama"
    });
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe("ready");
    expect(getWorldAssetRecord("world-asset-world-1", db)).toMatchObject({
      spzUrl500k: "https://cdn.example.com/500k.spz",
      colliderMeshUrl: null,
      panoUrl: "https://cdn.example.com/pano.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg"
    });
  });

  it("fails when an incomplete SPZ world has no fallback image", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return {
          ...completeWorldAsset(projectId, sceneClusterId),
          colliderMeshUrl: null,
          panoUrl: null,
          thumbnailUrl: null
        };
      }
    });
    db.prepare("UPDATE scene_clusters SET seed_image_urls_json = '[]' WHERE id = ?").run(
      sceneClusterId
    );
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs completed world did not include a renderable asset."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      status: "failed",
      worldId: "world-1"
    });
  });

  it("marks the scene failed when manifest persistence fails", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const blockedStorageRoot = path.join(tmpDir ?? "", "blocked-storage-root");
    await fs.writeFile(blockedStorageRoot, "not a directory");
    process.env.LOCAL_STORAGE_DIR = blockedStorageRoot;
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return completeWorldAsset(projectId, sceneClusterId);
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "WorldAsset manifest could not be stored."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      status: "failed",
      worldId: "world-1"
    });
  });

  it("marks the scene failed when completed world fetch throws", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        throw new Error("World Labs request failed with HTTP 500.");
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs request failed with HTTP 500."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      status: "failed",
      worldId: "world-1"
    });
  });

  it("fails and marks the scene failed when polling exceeds the configured limit", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const handler = createWorldLabsGenerationHandler({
      db,
      provider: createProviderStub({}),
      maxPolls: 1
    });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 2
        }
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs operation polling exceeded the configured limit."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe("failed");
  });

  it("fails and marks the scene failed when World Labs reports operation failure", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "failed", "world-1");
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        }
      },
      db
    );

    await expect(handler(job)).rejects.toThrow("World Labs operation failed.");
    expect(getSceneClusterRecord(sceneClusterId, db)).toMatchObject({
      status: "failed",
      worldId: "world-1"
    });
  });

  it("fails when a succeeded operation has no world id", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", null);
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        }
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs operation completed without a world id."
    );
    expect(getSceneClusterRecord(sceneClusterId, db)?.status).toBe("failed");
  });

  it("fails fast when sceneClusterId is missing", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const handler = createWorldLabsGenerationHandler({
      db,
      provider: createProviderStub({})
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "worldlabs-generation",
        payload: {},
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs generation job requires sceneClusterId."
    );
  });

  it("fails fast when the scene cluster no longer exists", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const handler = createWorldLabsGenerationHandler({
      db,
      provider: createProviderStub({})
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId: "missing-scene"
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "World Labs generation job could not find scene cluster."
    );
  });

  it("uses multiview seed imagery as thumbnail fallback only", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return {
          ...completeWorldAsset(projectId, sceneClusterId),
          panoUrl: null,
          thumbnailUrl: null
        };
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      renderMode: "spz"
    });
    expect(getWorldAssetRecord("world-asset-world-1", db)).toMatchObject({
      panoUrl: null,
      thumbnailUrl: "/api/storage/projects/project/space-seeds/front.png"
    });
  });

  it("uses panorama seed imagery as panorama and thumbnail fallback", async () => {
    db = await createTestDatabase();
    const { projectId, sceneClusterId } = createProjectScene(db, {
      operationId: "operation-1"
    });
    const provider = createProviderStub({
      async getOperation() {
        return operation("operation-1", "succeeded", "world-1");
      },
      async getWorldAssets() {
        return {
          ...completeWorldAsset(projectId, sceneClusterId),
          spzUrl100k: null,
          spzUrl500k: null,
          spzUrlFullRes: null,
          colliderMeshUrl: null,
          panoUrl: null,
          thumbnailUrl: null
        };
      }
    });
    const handler = createWorldLabsGenerationHandler({ db, provider });
    const job = createGenerationJob(
      {
        projectId,
        type: "worldlabs-generation",
        payload: {
          sceneClusterId,
          operationId: "operation-1",
          pollAttempt: 1,
          inputMode: "panorama",
          seedImages: [
            {
              url: "/api/storage/projects/project/space-seeds/panorama.png",
              view: "panorama",
              azimuth: null
            }
          ]
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      renderMode: "panorama"
    });
    expect(getWorldAssetRecord("world-asset-world-1", db)).toMatchObject({
      panoUrl: "/api/storage/projects/project/space-seeds/panorama.png",
      thumbnailUrl: "/api/storage/projects/project/space-seeds/panorama.png"
    });
  });
});

async function createTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-worldlabs-job-"));
  previousStorageDir = process.env.LOCAL_STORAGE_DIR;
  process.env.LOCAL_STORAGE_DIR = path.join(tmpDir, "uploads");
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

function createProjectScene(
  db: DatabaseClient,
  options: { operationId?: string; status?: "waiting_for_world" | "failed" } = {}
): { projectId: string; sceneClusterId: string } {
  const project = createProjectRecord({}, db);
  const sceneCluster = createSceneClusterRecord(
    {
      projectId: project.id,
      label: "Living room",
      sourceImageIds: ["image-1"],
      representativeImageIds: ["image-1"],
      spatialPrompt: "A quiet living room.",
      seedImageUrls: ["/api/storage/projects/project/space-seeds/front.png"],
      worldLabsOperationId: options.operationId ?? null,
      status: options.status ?? "waiting_for_world"
    },
    db
  );

  return {
    projectId: project.id,
    sceneClusterId: sceneCluster.id
  };
}

function createProviderStub(
  overrides: Partial<WorldLabsProvider>
): WorldLabsProvider {
  return {
    async createWorld() {
      throw new Error("createWorld not implemented in test stub");
    },
    async getOperation() {
      throw new Error("getOperation not implemented in test stub");
    },
    async getWorldAssets() {
      throw new Error("getWorldAssets not implemented in test stub");
    },
    ...overrides
  };
}

function operation(
  operationId: string,
  status: WorldLabsOperation["status"],
  worldId: string | null
): WorldLabsOperation {
  return {
    operationId,
    status,
    worldId,
    raw: {}
  };
}

function completeWorldAsset(projectId: string, sceneClusterId: string): WorldAsset {
  return {
    id: "world-asset-world-1",
    projectId,
    sceneClusterId,
    worldId: "world-1",
    spzUrl100k: "https://cdn.example.com/100k.spz",
    spzUrl500k: "https://cdn.example.com/500k.spz",
    spzUrlFullRes: "https://cdn.example.com/full.spz",
    colliderMeshUrl: "https://cdn.example.com/collider.glb",
    panoUrl: "https://cdn.example.com/pano.jpg",
    thumbnailUrl: "https://cdn.example.com/thumb.jpg",
    groundPlaneOffset: 0,
    initialCameraPose: null
  };
}
