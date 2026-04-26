import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseClient } from "@/server/db";
import {
  claimNextGenerationJob,
  createGenerationJob,
  failGenerationJob
} from "@/server/jobs";
import { createSceneClusterRecord } from "@/server/assets/world-assets";
import { SPACE_RECONSTRUCTION_PROMPT_VERSION } from "@/ai/scene";
import { createLocalStorageDriver } from "@/server/storage";
import {
  ClarificationValidationError,
  createClarificationPetProfile,
  createProjectFromUploads,
  getProjectBundle,
  getLoadingStage,
  getPublicProjectStatus,
  submitProjectClarification
} from ".";

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

async function createTestContext() {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-intake-"));
  const storageDir = path.join(tmpDir, "uploads");
  db = openDatabase(path.join(tmpDir, "test.sqlite"));

  return {
    db,
    storage: createLocalStorageDriver(storageDir),
    storageDir
  };
}

describe("intake project flow", () => {
  it("stores uploaded images and starts pet analysis before clarification", async () => {
    const context = await createTestContext();

    const result = await createProjectFromUploads(
      [
        createImageUpload("one.jpg"),
        createImageUpload("two.png", "image/png"),
        createImageUpload("three.webp", "image/webp")
      ],
      context
    );

    const bundle = getProjectBundle(result.project.id, context.db);

    expect(result.project.status).toBe("analyzing");
    expect(result.project.selectedPetId).toBeNull();
    expect(result.warning).toBeNull();
    expect(bundle?.uploadedImages).toHaveLength(3);
    expect(bundle?.petProfile).toBeNull();
    expect(bundle?.project.currentStage).toBe("Looking through your memories");
    const analysisJobCount = context.db
      .prepare(
        "SELECT COUNT(*) AS count FROM generation_jobs WHERE project_id = ? AND type = 'pet-analysis'"
      )
      .get(result.project.id) as { count: number };
    expect(analysisJobCount.count).toBe(1);

    const publicStatus = getPublicProjectStatus(result.project.id, {
      db: context.db
    });
    expect(publicStatus?.nextRoute).toBeNull();
  });

  it("submits clarification and resumes analysis from the loading lifecycle", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg")],
      context
    );
    markProjectAsNeedingClarification(context.db, result.project.id);

    const clarified = submitProjectClarification(
      result.project.id,
      "the small white dog with brown ears",
      context.db
    );

    expect(clarified.status).toBe("analyzing");
    expect(clarified.currentStage).toBe("Finding what feels familiar");
    expect(clarified.selectedPetId).toBeNull();
    const clarificationJob = context.db
      .prepare(
        "SELECT payload_json FROM generation_jobs WHERE project_id = ? AND type = 'pet-analysis' ORDER BY created_at DESC LIMIT 1"
      )
      .get(result.project.id) as { payload_json: string };
    expect(JSON.parse(clarificationJob.payload_json)).toMatchObject({
      clarificationAnswer: "the small white dog with brown ears"
    });
  });

  it("rejects duplicate or stale clarification without rewinding the project", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg")],
      context
    );
    markProjectAsNeedingClarification(context.db, result.project.id);
    const clarified = submitProjectClarification(
      result.project.id,
      "the small white dog with brown ears",
      context.db
    );

    expect(() =>
      submitProjectClarification(
        result.project.id,
        "the cat with the blue collar",
        context.db
      )
    ).toThrow(ClarificationValidationError);

    const bundle = getProjectBundle(result.project.id, context.db);
    expect(bundle?.project.status).toBe("analyzing");
    expect(bundle?.project.selectedPetId).toBe(clarified.selectedPetId);
  });

  it("does not advance readiness from status polling alone", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg")],
      context
    );
    markProjectAsNeedingClarification(context.db, result.project.id);
    submitProjectClarification(
      result.project.id,
      "the small white dog with brown ears",
      context.db
    );
    context.db
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 60_000).toISOString(), result.project.id);

    for (let index = 0; index < 6; index += 1) {
      getPublicProjectStatus(result.project.id, { db: context.db });
    }

    const bundle = getProjectBundle(result.project.id, context.db);
    expect(bundle?.project.status).toBe("analyzing");
    expect(getPublicProjectStatus(result.project.id, { db: context.db })?.canEnter).toBe(
      false
    );
  });

  it("maps retrying jobs to gentle public loading copy", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [
        createImageUpload("one.jpg"),
        createImageUpload("two.jpg"),
        createImageUpload("three.jpg")
      ],
      context
    );
    markProjectAsNeedingClarification(context.db, result.project.id);

    submitProjectClarification(result.project.id, "the cat with the blue collar", context.db);

    const job = createGenerationJob(
      {
        projectId: result.project.id,
        type: "worldlabs-generation",
        maxAttempts: 3
      },
      context.db
    );
    claimNextGenerationJob({ workerId: "test-worker" }, context.db);
    failGenerationJob(
      {
        jobId: job.id,
        errorMessage: "Provider unavailable.",
        retryDelayMs: 10_000
      },
      context.db
    );

    const publicStatus = getPublicProjectStatus(result.project.id, {
      db: context.db
    });

    expect(publicStatus?.stage.title).toBe("Making the space feel calm");
    expect(publicStatus?.retry?.message).toContain(
      "This is taking a little longer than expected."
    );
    expect(publicStatus?.retry?.message).not.toContain(job.id);
  });

  it("exposes generated space reconstruction previews in public status", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      context
    );

    const sceneCluster = createSceneClusterRecord(
      {
        projectId: result.project.id,
        label: "Living room",
        sourceImageIds: [],
        representativeImageIds: [],
        spatialPrompt: "A high-fidelity reconstructed living room.",
        seedImageUrls: [
          "/api/storage/projects/project-1/space-seeds/front.png",
          "/api/storage/projects/project-1/space-seeds/left.png"
        ],
        seedPromptVersion: SPACE_RECONSTRUCTION_PROMPT_VERSION,
        status: "generating_seed"
      },
      context.db
    );

    const publicStatus = getPublicProjectStatus(result.project.id, {
      db: context.db
    });

    expect(publicStatus?.spacePreviewImages).toEqual([
      {
        id: `${sceneCluster.id}-seed-0`,
        url: "/api/storage/projects/project-1/space-seeds/front.png",
        label: "Space reconstruction preview 1",
        order: 0
      },
      {
        id: `${sceneCluster.id}-seed-1`,
        url: "/api/storage/projects/project-1/space-seeds/left.png",
        label: "Space reconstruction preview 2",
        order: 1
      }
    ]);
  });

  it("does not expose stale space previews from older prompt versions", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      context
    );

    createSceneClusterRecord(
      {
        projectId: result.project.id,
        label: "Living room",
        sourceImageIds: [],
        representativeImageIds: [],
        spatialPrompt: "A previous living room prompt.",
        seedImageUrls: ["/api/storage/projects/project-1/space-seeds/old.png"],
        seedPromptVersion: null,
        status: "waiting_for_world"
      },
      context.db
    );

    expect(
      getPublicProjectStatus(result.project.id, { db: context.db })?.spacePreviewImages
    ).toEqual([]);
  });

  it("cleans up partial upload state when storage fails", async () => {
    const context = await createTestContext();
    let writeCount = 0;
    const failingStorage = {
      putObject: async (input: Parameters<typeof context.storage.putObject>[0]) => {
        writeCount += 1;

        if (writeCount === 2) {
          throw new Error("Storage write failed.");
        }

        return context.storage.putObject(input);
      },
      getObject: context.storage.getObject.bind(context.storage),
      deleteObject: context.storage.deleteObject.bind(context.storage),
      getObjectUrl: context.storage.getObjectUrl.bind(context.storage)
    };

    await expect(
      createProjectFromUploads(
        [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
        {
          db: context.db,
          storage: failingStorage
        }
      )
    ).rejects.toThrow("Storage write failed.");

    const projectCount = context.db
      .prepare("SELECT COUNT(*) AS count FROM projects")
      .get() as { count: number };
    expect(projectCount.count).toBe(0);
    await expect(countStoredFiles(context.storageDir)).resolves.toBe(0);
  });
});

function createImageUpload(fileName: string, contentType = "image/jpeg") {
  return {
    fileName,
    contentType,
    size: 12,
    body: Buffer.from("image-bytes")
  };
}

function markProjectAsNeedingClarification(
  db: DatabaseClient,
  projectId: string
): void {
  createClarificationPetProfile(projectId, [], db);
  const stage = getLoadingStage(1);
  db.prepare(
    `UPDATE projects
     SET status = 'clarification_required',
         current_stage = ?,
         current_step_index = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(stage.title, stage.index, new Date().toISOString(), projectId);
}

async function countStoredFiles(directory: string): Promise<number> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const counts = await Promise.all(
      entries.map((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return countStoredFiles(entryPath);
        }

        return Promise.resolve(
          entry.isFile() && entry.name !== ".storage-url-secret" ? 1 : 0
        );
      })
    );

    return counts.reduce((total, count) => total + count, 0);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return 0;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
