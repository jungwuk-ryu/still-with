import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectRecord, openDatabase, type DatabaseClient } from "@/server/db";
import { createSceneClusterRecord } from "@/server/assets/world-assets";
import {
  ensureDreamFragmentsForSpace,
  listDreamFragmentsForSpace
} from "./dream-fragments";

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

describe("dream fragment lazy backfill", () => {
  it("creates missing fragments and one generation job from scene image ids", async () => {
    const context = await createTestContext();
    const project = createProjectRecord({ status: "ready" }, context.db);
    const images = insertUploadedImages(context.db, project.id, 3);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: images.map((image) => image.id),
        representativeImageIds: [images[1]?.id ?? images[0]!.id],
        spatialPrompt: "A calm living room.",
        status: "ready"
      },
      context.db
    );

    const result = ensureDreamFragmentsForSpace(
      project.id,
      sceneCluster.id,
      context.db
    );

    expect(result.fragments).toHaveLength(2);
    expect(result.fragments.map((fragment) => fragment.sourceImageId)).toEqual([
      images[0]?.id,
      images[1]?.id
    ]);
    expect(result.pending).toBe(true);
    expect(countDreamFragmentJobs(context.db, project.id)).toBe(1);

    ensureDreamFragmentsForSpace(project.id, sceneCluster.id, context.db);

    expect(listDreamFragmentsForSpace(project.id, sceneCluster.id, context.db)).toHaveLength(
      2
    );
    expect(countDreamFragmentJobs(context.db, project.id)).toBe(1);
  });

  it("falls back to uploaded images for older scene clusters without source ids", async () => {
    const context = await createTestContext();
    const project = createProjectRecord({ status: "ready" }, context.db);
    const images = insertUploadedImages(context.db, project.id, 2);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Older room",
        sourceImageIds: [],
        representativeImageIds: [],
        spatialPrompt: "An older generated room.",
        status: "ready"
      },
      context.db
    );

    const result = ensureDreamFragmentsForSpace(
      project.id,
      sceneCluster.id,
      context.db
    );

    expect(result.fragments).toHaveLength(2);
    expect(result.fragments.map((fragment) => fragment.sourceImageId)).toEqual(
      images.map((image) => image.id)
    );
    expect(countDreamFragmentJobs(context.db, project.id)).toBe(1);
  });
});

async function createTestContext() {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-fragments-"));
  db = openDatabase(path.join(tmpDir, "test.sqlite"));

  return { db };
}

function insertUploadedImages(
  db: DatabaseClient,
  projectId: string,
  count: number
): Array<{ id: string; url: string }> {
  const images = Array.from({ length: count }, (_, index) => ({
    id: `image-${index + 1}`,
    url: `/api/storage/projects/${projectId}/uploads/${index + 1}.jpg`
  }));
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO uploaded_images (
      id, project_id, original_url, thumbnail_url, width, height,
      mime_type, exif_metadata_json, upload_order, created_at
    ) VALUES (?, ?, ?, NULL, NULL, NULL, 'image/jpeg', NULL, ?, ?)`
  );

  for (const [index, image] of images.entries()) {
    insert.run(image.id, projectId, image.url, index, now);
  }

  return images;
}

function countDreamFragmentJobs(db: DatabaseClient, projectId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM generation_jobs
       WHERE project_id = ? AND type = 'dream-fragment'`
    )
    .get(projectId) as { count: number };

  return row.count;
}
