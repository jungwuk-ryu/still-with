import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectRecord,
  getProjectRecord,
  openDatabase,
  type DatabaseClient
} from "@/server/db";
import { createGenerationJob } from "@/server/jobs/repository";
import { createSceneClusterRecord } from "@/server/assets/world-assets";
import type { SceneClassifier } from "@/ai/scene";
import type { ClassifiedSceneCluster } from "@/ai/scene/types";
import { createSceneClassificationHandler } from "./handler";

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

describe("scene classification handler", () => {
  it("persists a primary scene cluster and enqueues space seed generation", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const handler = createSceneClassificationHandler({
      db,
      classifier: createClassifier(classifiedCluster())
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "scene-classification",
        priority: 4
      },
      db
    );

    const result = await handler(job);

    expect(result).toMatchObject({
      label: "Living room",
      seedStrategy: "generated-multiview"
    });
    const sceneCluster = db
      .prepare("SELECT * FROM scene_clusters WHERE project_id = ?")
      .get(project.id) as { id: string; spatial_prompt: string; status: string };
    expect(sceneCluster).toMatchObject({
      spatial_prompt: "A quiet living room with clear central floor space.",
      status: "selected"
    });
    const nextJob = db
      .prepare(
        "SELECT type, payload_json, max_attempts FROM generation_jobs WHERE type = 'space-seed'"
      )
      .get() as { type: string; payload_json: string; max_attempts: number };
    expect(nextJob.type).toBe("space-seed");
    expect(nextJob.max_attempts).toBe(1);
    expect(JSON.parse(nextJob.payload_json)).toMatchObject({
      sceneClusterId: sceneCluster.id,
      seedStrategy: "generated-multiview"
    });
  });

  it("reuses a scene cluster already waiting for World Labs", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    db.prepare(
      `INSERT INTO scene_clusters (
        id, project_id, label, source_image_ids_json,
        representative_image_ids_json, spatial_prompt, seed_image_urls_json,
        world_labs_operation_id, world_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "scene-1",
      project.id,
      "Bedroom",
      JSON.stringify(["image-1"]),
      JSON.stringify(["image-1"]),
      "Existing prompt",
      JSON.stringify(["/api/storage/seed.png"]),
      "operation-1",
      null,
      "waiting_for_world",
      new Date().toISOString(),
      new Date().toISOString()
    );
    const handler = createSceneClassificationHandler({
      db,
      classifier: {
        async classify() {
          throw new Error("classifier should not be called");
        }
      }
    });
    const job = createGenerationJob({
      projectId: project.id,
      type: "scene-classification"
    }, db);

    await expect(handler(job)).resolves.toMatchObject({
      sceneClusterId: "scene-1",
      reusedExistingCluster: true
    });
  });

  it("keeps a ready project enterable during background space classification", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt: "Existing prompt",
        seedImageUrls: ["/api/storage/seed.png"],
        seedPromptVersion: "space-reconstruction-v1",
        worldLabsOperationId: "operation-1",
        worldId: "world-1",
        status: "ready"
      },
      db
    );
    markProjectReady(db, project.id);
    const handler = createSceneClassificationHandler({
      db,
      classifier: createClassifier(classifiedCluster()),
      enqueueNextJob: false
    });
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "scene-classification",
        payload: {
          backgroundSpaces: true
        },
        maxAttempts: 1
      },
      db
    );

    await expect(handler(job)).resolves.toMatchObject({
      label: "Living room"
    });
    expect(getProjectRecord(project.id, db)).toMatchObject({
      status: "ready",
      currentStage: "The door is open",
      currentStepIndex: 6,
      debugProgressPercent: 100
    });
  });

  it("clears stale World Labs state when reclassifying a failed scene", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    db.prepare(
      `INSERT INTO scene_clusters (
        id, project_id, label, source_image_ids_json,
        representative_image_ids_json, spatial_prompt, seed_image_urls_json,
        world_labs_operation_id, world_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "scene-1",
      project.id,
      "Old room",
      JSON.stringify(["image-1"]),
      JSON.stringify(["image-1"]),
      "Old prompt",
      JSON.stringify(["/api/storage/projects/project/space-seeds/front.png"]),
      "old-operation",
      "old-world",
      "failed",
      new Date().toISOString(),
      new Date().toISOString()
    );
    const handler = createSceneClassificationHandler({
      db,
      classifier: createClassifier(classifiedCluster())
    });
    const job = createGenerationJob({
      projectId: project.id,
      type: "scene-classification"
    }, db);

    await expect(handler(job)).resolves.toMatchObject({
      sceneClusterId: "scene-1",
      label: "Living room"
    });
    expect(
      db
        .prepare(
          `SELECT seed_image_urls_json, world_labs_operation_id, world_id, status
           FROM scene_clusters
           WHERE id = ?`
        )
        .get("scene-1")
    ).toMatchObject({
      seed_image_urls_json: "[]",
      world_labs_operation_id: null,
      world_id: null,
      status: "selected"
    });
  });

  it("fails fast when no uploaded images exist", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    const handler = createSceneClassificationHandler({
      db,
      classifier: createClassifier(classifiedCluster())
    });
    const job = createGenerationJob({
      projectId: project.id,
      type: "scene-classification"
    }, db);

    await expect(handler(job)).rejects.toThrow(
      "Scene classification requires at least one uploaded image."
    );
  });

  it("marks the project failed when classification throws after preparation starts", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const handler = createSceneClassificationHandler({
      db,
      classifier: {
        async classify() {
          throw new Error("classifier unavailable");
        }
      }
    });
    const job = createGenerationJob({
      projectId: project.id,
      type: "scene-classification",
      maxAttempts: 1
    }, db);

    await expect(handler(job)).rejects.toThrow("classifier unavailable");
    expect(getProjectRecord(project.id, db)?.status).toBe("failed");
  });

  it("keeps the project retryable when classification fails before the final attempt", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);
    insertUploadedImage(db, project.id, "image-1", 0);
    const handler = createSceneClassificationHandler({
      db,
      classifier: {
        async classify() {
          throw new Error("classifier unavailable");
        }
      }
    });
    const job = createGenerationJob({
      projectId: project.id,
      type: "scene-classification"
    }, db);

    await expect(handler(job)).rejects.toThrow("classifier unavailable");
    expect(getProjectRecord(project.id, db)?.status).toBe("preparing_space");
  });
});

async function createTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-scene-job-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

function createClassifier(cluster: ClassifiedSceneCluster): SceneClassifier {
  return {
    async classify(input) {
      return {
        projectId: input.projectId,
        primaryCluster: cluster,
        clusters: [cluster],
        raw: { ok: true }
      };
    }
  };
}

function classifiedCluster(): ClassifiedSceneCluster {
  return {
    label: "Living room",
    sourceImageIds: ["image-1"],
    representativeImageIds: ["image-1"],
    directWorldInputImageIds: [],
    spatialPrompt: "A quiet living room with clear central floor space.",
    visualEvidence: ["oak floor"],
    seedStrategy: "generated-multiview",
    confidence: 0.82
  };
}

function markProjectReady(db: DatabaseClient, projectId: string): void {
  db.prepare(
    `UPDATE projects
     SET status = 'ready',
         current_stage = 'The door is open',
         current_step_index = 6,
         debug_progress_percent = 100,
         completed_at = '2026-04-26T00:00:00.000Z'
     WHERE id = ?`
  ).run(projectId);
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
