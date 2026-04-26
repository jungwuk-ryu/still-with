import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectRecord, openDatabase, type DatabaseClient } from "@/server/db";
import { createGenerationJob } from "@/server/jobs/repository";
import {
  createSceneClusterRecord,
  getSceneClusterRecord
} from "@/server/assets/world-assets";
import type { SceneSeedGenerator } from "@/ai/scene";
import { createSpaceSeedHandler } from "./handler";

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

describe("space seed handler", () => {
  it("generates front/left/right/back seed images and enqueues World Labs", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt: "A quiet living room."
      },
      db
    );
    const seenViews: string[] = [];
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: createSeedGenerator(seenViews)
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id,
          seedStrategy: "generated-multiview"
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      sceneClusterId: sceneCluster.id,
      strategy: "generated-multiview"
    });

    expect(seenViews).toEqual(["front", "left", "right", "back"]);
    expect(getSceneClusterRecord(sceneCluster.id, db)?.seedImageUrls).toHaveLength(4);
    expect(getSceneClusterRecord(sceneCluster.id, db)?.status).toBe("waiting_for_world");
    const nextJob = db
      .prepare(
        "SELECT payload_json, max_attempts FROM generation_jobs WHERE type = 'worldlabs-generation'"
      )
      .get() as { payload_json: string; max_attempts: number };
    expect(JSON.parse(nextJob.payload_json)).toMatchObject({
      sceneClusterId: sceneCluster.id,
      inputMode: "multi-image"
    });
    expect(nextJob.max_attempts).toBe(1);
  });

  it("does not forward uploaded photos directly without an explicit safe gate", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    insertUploadedImage(db, project.id, "image-2", 1);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Bedroom",
        sourceImageIds: ["image-1", "image-2"],
        representativeImageIds: ["image-1", "image-2"],
        spatialPrompt: "A quiet bedroom."
      },
      db
    );
    const seenViews: string[] = [];
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: createSeedGenerator(seenViews)
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id,
          seedStrategy: "direct-multi-image",
          directWorldInputImageIds: ["image-1", "image-2"]
        }
      },
      db
    );

    await handler(job);

    expect(seenViews).toEqual(["front", "left", "right", "back"]);
    expect(getSceneClusterRecord(sceneCluster.id, db)?.seedImageUrls).toEqual([
      "/api/storage/projects/project-1/space-seeds/front.png",
      "/api/storage/projects/project-1/space-seeds/left.png",
      "/api/storage/projects/project-1/space-seeds/right.png",
      "/api/storage/projects/project-1/space-seeds/back.png"
    ]);
  });

  it("forwards uploaded photos only when the explicit safe gate is present", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    insertUploadedImage(db, project.id, "image-2", 1);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Sunroom",
        sourceImageIds: ["image-1", "image-2"],
        representativeImageIds: ["image-1", "image-2"],
        spatialPrompt: "A quiet sunroom."
      },
      db
    );
    const handler = createSpaceSeedHandler({
      db,
      allowDirectUploadedSeedImages: true,
      seedGenerator: {
        async generateSeed() {
          throw new Error("seed generator should not be called");
        }
      }
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id,
          seedStrategy: "direct-multi-image",
          directWorldInputImageIds: ["image-1", "image-2"]
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      strategy: "direct-multi-image",
      seedImageUrls: [
        `/api/storage/projects/${project.id}/uploads/image-1.jpg`,
        `/api/storage/projects/${project.id}/uploads/image-2.jpg`
      ]
    });
    const nextJob = db
      .prepare(
        "SELECT payload_json FROM generation_jobs WHERE type = 'worldlabs-generation'"
      )
      .get() as { payload_json: string };
    expect(JSON.parse(nextJob.payload_json)).toMatchObject({
      inputMode: "multi-image",
      seedImages: [
        {
          url: `/api/storage/projects/${project.id}/uploads/image-1.jpg`,
          view: "front",
          azimuth: 0
        },
        {
          url: `/api/storage/projects/${project.id}/uploads/image-2.jpg`,
          view: "left",
          azimuth: 270
        }
      ]
    });
  });

  it("reuses seed images once a World Labs operation exists", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Favorite corner",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt: "A quiet favorite corner.",
        seedImageUrls: ["/api/storage/existing.png"],
        worldLabsOperationId: "operation-1",
        status: "waiting_for_world"
      },
      db
    );
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: {
        async generateSeed() {
          throw new Error("seed generator should not be called");
        }
      }
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id
        }
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      reusedExistingSeeds: true,
      seedImageUrls: ["/api/storage/existing.png"]
    });
  });

  it("does not reuse stale seed images from a selected scene with an old operation", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Favorite corner",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt: "A quiet favorite corner.",
        seedImageUrls: ["/api/storage/stale-seed.png"],
        worldLabsOperationId: "old-operation",
        status: "selected"
      },
      db
    );
    const seenViews: string[] = [];
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: createSeedGenerator(seenViews)
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id,
          seedStrategy: "generated-multiview"
        }
      },
      db
    );

    const result = await handler(job);

    expect(result).toMatchObject({
      seedImageUrls: [
        "/api/storage/projects/project-1/space-seeds/front.png",
        "/api/storage/projects/project-1/space-seeds/left.png",
        "/api/storage/projects/project-1/space-seeds/right.png",
        "/api/storage/projects/project-1/space-seeds/back.png"
      ]
    });
    expect(JSON.stringify(result)).not.toContain("reusedExistingSeeds");
    expect(seenViews).toEqual(["front", "left", "right", "back"]);
    expect(getSceneClusterRecord(sceneCluster.id, db)).toMatchObject({
      worldLabsOperationId: null,
      worldId: null,
      status: "waiting_for_world"
    });
  });

  it("marks the scene failed when seed generation throws", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt: "A quiet living room."
      },
      db
    );
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: {
        async generateSeed() {
          throw new Error("seed generation unavailable");
        }
      }
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id,
          seedStrategy: "generated-multiview"
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).rejects.toThrow("seed generation unavailable");
    expect(getSceneClusterRecord(sceneCluster.id, db)?.status).toBe("failed");
  });

  it("keeps the scene retryable when seed generation fails before final attempt", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt: "A quiet living room."
      },
      db
    );
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: {
        async generateSeed() {
          throw new Error("seed generation unavailable");
        }
      }
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: sceneCluster.id,
          seedStrategy: "generated-multiview"
        }
      },
      db
    );

    await expect(handler(job)).rejects.toThrow("seed generation unavailable");
    expect(getSceneClusterRecord(sceneCluster.id, db)?.status).toBe("generating_seed");
  });

  it("fails fast when sceneClusterId is missing", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: createSeedGenerator([])
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {}
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "Space seed job requires sceneClusterId."
    );
  });

  it("fails fast when the scene cluster no longer exists", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const handler = createSpaceSeedHandler({
      db,
      seedGenerator: createSeedGenerator([])
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        payload: {
          sceneClusterId: "missing-scene"
        }
      },
      db
    );

    await expect(handler(job)).rejects.toThrow(
      "Space seed job could not find scene cluster."
    );
  });
});

async function createTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-seed-job-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

function createSeedGenerator(seenViews: string[]): SceneSeedGenerator {
  return {
    async generateSeed(input) {
      seenViews.push(input.view);
      return {
        view: input.view,
        azimuth: input.view === "panorama" ? null : 0,
        url: `/api/storage/projects/project-1/space-seeds/${input.view}.png`,
        prompt: input.prompt
      };
    }
  };
}

function insertUploadedImage(
  db: DatabaseClient,
  projectId: string,
  imageId: string,
  uploadOrder: number
): void {
  db.prepare(
    `INSERT INTO uploaded_images (
      id, project_id, original_url, thumbnail_url, width, height,
      mime_type, exif_metadata_json, upload_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    imageId,
    projectId,
    `/api/storage/projects/${projectId}/uploads/${imageId}.jpg`,
    null,
    1024,
    768,
    "image/jpeg",
    null,
    uploadOrder,
    new Date().toISOString()
  );
}
