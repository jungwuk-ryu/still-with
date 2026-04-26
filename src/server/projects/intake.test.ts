import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  listPublicDreams,
  ProjectUploadValidationError,
  submitProjectClarification,
  updateProjectLifecycle
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
    expect(bundle?.project.currentStage).toBe("Waking the memory");
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
    expect(publicStatus?.displayName).toBeNull();
    expect(publicStatus?.isPublic).toBe(false);
  });

  it("stores the pet name as the dream name and public setting", async () => {
    const context = await createTestContext();

    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      {
        db: context.db,
        storage: context.storage,
        settings: {
          displayName: "  Mochi   Bear  ",
          isPublic: true
        }
      }
    );

    expect(result.project).toMatchObject({
      displayName: "Mochi Bear",
      isPublic: true
    });
    expect(getPublicProjectStatus(result.project.id, { db: context.db })).toMatchObject({
      displayName: "Mochi Bear",
      isPublic: true
    });
  });

  it("rejects dream names that are too long", async () => {
    const context = await createTestContext();

    await expect(
      createProjectFromUploads(
        [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
        {
          db: context.db,
          storage: context.storage,
          settings: {
            displayName: "M".repeat(81)
          }
        }
      )
    ).rejects.toBeInstanceOf(ProjectUploadValidationError);
  });

  it("rejects uploads before processing when no pet is visible", async () => {
    const context = await createTestContext();
    const petPresenceDetector = {
      detectPetPresence: vi.fn(async () => ({
        hasPet: false,
        confidence: "high" as const,
        reason: "Only empty rooms are visible."
      }))
    };

    await expect(
      createProjectFromUploads(
        [createImageUpload("room.jpg"), createImageUpload("chair.png", "image/png")],
        {
          db: context.db,
          storage: context.storage,
          petPresenceDetector
        }
      )
    ).rejects.toThrow(
      "We could not find a pet in these photos. Add at least one clear photo of your pet so we can build the memory space around them."
    );

    expect(petPresenceDetector.detectPetPresence).toHaveBeenCalledWith({
      images: [
        expect.objectContaining({
          fileName: "room.jpg",
          mimeType: "image/jpeg"
        }),
        expect.objectContaining({
          fileName: "chair.png",
          mimeType: "image/png"
        })
      ]
    });
    expect(
      (context.db.prepare("SELECT COUNT(*) AS count FROM projects").get() as {
        count: number;
      }).count
    ).toBe(0);
    expect(
      (context.db.prepare("SELECT COUNT(*) AS count FROM generation_jobs").get() as {
        count: number;
      }).count
    ).toBe(0);
    await expect(countStoredFiles(context.storageDir)).resolves.toBe(0);
  });

  it("continues intake when the pet presence check finds a pet", async () => {
    const context = await createTestContext();
    const petPresenceDetector = {
      detectPetPresence: vi.fn(async () => ({
        hasPet: true,
        confidence: "medium" as const,
        reason: "A small dog is visible."
      }))
    };

    const result = await createProjectFromUploads([createImageUpload("pet.jpg")], {
      db: context.db,
      storage: context.storage,
      petPresenceDetector
    });

    expect(result.project.status).toBe("analyzing");
    expect(petPresenceDetector.detectPetPresence).toHaveBeenCalledOnce();
  });

  it("does not treat an unavailable pet presence check as no pet found", async () => {
    const context = await createTestContext();
    const petPresenceDetector = {
      detectPetPresence: vi.fn(async () => {
        throw new Error("Malformed provider response.");
      })
    };

    await expect(
      createProjectFromUploads([createImageUpload("pet.jpg")], {
        db: context.db,
        storage: context.storage,
        petPresenceDetector
      })
    ).rejects.toThrow(
      "We could not check these photos just now. Please try again in a moment."
    );

    expect(
      (context.db.prepare("SELECT COUNT(*) AS count FROM projects").get() as {
        count: number;
      }).count
    ).toBe(0);
    await expect(countStoredFiles(context.storageDir)).resolves.toBe(0);
  });

  it("lists only ready public dreams", async () => {
    const context = await createTestContext();
    const publicDream = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      {
        db: context.db,
        storage: context.storage,
        settings: {
          displayName: "Mochi",
          isPublic: true
        }
      }
    );
    const privateDream = await createProjectFromUploads(
      [createImageUpload("three.jpg"), createImageUpload("four.jpg")],
      {
        db: context.db,
        storage: context.storage,
        settings: {
          displayName: "Bori",
          isPublic: false
        }
      }
    );
    const unfinishedPublicDream = await createProjectFromUploads(
      [createImageUpload("five.jpg"), createImageUpload("six.jpg")],
      {
        db: context.db,
        storage: context.storage,
        settings: {
          displayName: "Nabi",
          isPublic: true
        }
      }
    );

    markReadyDream(context.db, publicDream.project.id, "public-scene");
    markReadyDream(context.db, privateDream.project.id, "private-scene");

    expect(listPublicDreams(context.db)).toEqual([
      expect.objectContaining({
        projectId: publicDream.project.id,
        displayName: "Mochi",
        title: "Mochi's dream",
        href: `/projects/${publicDream.project.id}/loading?entry=public`,
        thumbnailUrl: `/api/storage/projects/${publicDream.project.id}/world/thumb.jpg`
      })
    ]);
    expect(
      listPublicDreams(context.db).some(
        (dream) => dream.projectId === unfinishedPublicDream.project.id
      )
    ).toBe(false);
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
    expect(clarified.currentStage).toBe("Following the familiar trace");
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

    expect(publicStatus?.stage.title).toBe("Stepping into the dream");
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
          "/api/storage/projects/project-1/space-seeds/left.png",
          "/api/storage/projects/project-1/space-seeds/right.png"
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

  it("uses stage-aware public copy for failed pet generation", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      context
    );

    updateProjectLifecycle(
      result.project.id,
      {
        status: "failed",
        currentStage: getLoadingStage(4).title,
        currentStepIndex: 4,
        errorCode: "PET_VIDEO_FAILED",
        errorMessage: "provider timed out with internal details"
      },
      context.db
    );

    const publicStatus = getPublicProjectStatus(result.project.id, {
      db: context.db
    });

    expect(publicStatus?.stage.title).toBe("Bringing back a gentle presence");
    expect(publicStatus?.error).toEqual({
      code: "PET_VIDEO_FAILED",
      message:
        "The room was prepared, but the gentle presence could not be completed."
    });
    expect(publicStatus?.error?.message).not.toContain("provider");
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

function markReadyDream(
  db: DatabaseClient,
  projectId: string,
  sceneClusterId: string
): void {
  createSceneClusterRecord(
    {
      id: sceneClusterId,
      projectId,
      label: "Living room",
      sourceImageIds: [],
      representativeImageIds: [],
      spatialPrompt: "A quiet living room.",
      seedImageUrls: [`/api/storage/projects/${projectId}/space-seeds/front.png`],
      seedPromptVersion: SPACE_RECONSTRUCTION_PROMPT_VERSION,
      worldId: `world-${sceneClusterId}`,
      status: "ready"
    },
    db
  );
  db.prepare(
    `INSERT INTO world_assets (
      id, project_id, scene_cluster_id, world_id,
      spz_url_100k, spz_url_500k, spz_url_full_res,
      collider_mesh_url, pano_url, thumbnail_url, ground_plane_offset,
      initial_camera_pose_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `world-asset-${sceneClusterId}`,
    projectId,
    sceneClusterId,
    `world-${sceneClusterId}`,
    null,
    `/api/storage/projects/${projectId}/world/500k.spz`,
    null,
    `/api/storage/projects/${projectId}/world/collider.glb`,
    `/api/storage/projects/${projectId}/world/pano.jpg`,
    `/api/storage/projects/${projectId}/world/thumb.jpg`,
    0,
    null,
    new Date().toISOString(),
    new Date().toISOString()
  );
  updateProjectLifecycle(
    projectId,
    {
      status: "ready",
      completedAt: "2026-04-26T00:00:00.000Z"
    },
    db
  );
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
