import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseClient } from "@/server/db";
import { getGenerationJob } from "@/server/jobs";
import { createLocalStorageDriver } from "@/server/storage";
import { createProjectFromUploads, getProjectBundle } from "@/server/projects";
import type { OpenAIProvider } from "@/server/providers";
import type { GenerationJob, PetProfile } from "@/types";
import { handlePetAnalysisJob } from "./handler";

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

describe("handlePetAnalysisJob", () => {
  it("auto-selects a confident pet and enqueues space and pet generation", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [
        createImageUpload("one.jpg"),
        createImageUpload("two.jpg"),
        createImageUpload("three.jpg")
      ],
      context
    );
    const job = getPetAnalysisJob(context.db);
    const petProfile = createPetProfile(result.project.id);
    const provider = createProvider({
      async analyzePetIdentity(input) {
        expect(input.imageUrls[0]).toMatch(/^data:image\/jpeg;base64,/);
        return {
          petProfile,
          clarificationRequired: false,
          clarificationPrompt: null,
          raw: {}
        };
      }
    });

    await handlePetAnalysisJob(job!, {
      db: context.db,
      storage: context.storage,
      openAIProvider: provider
    });

    const bundle = getProjectBundle(result.project.id, context.db);
    const queuedTypes = context.db
      .prepare(
        "SELECT type FROM generation_jobs WHERE project_id = ? ORDER BY type ASC"
      )
      .all(result.project.id) as Array<{ type: string }>;

    expect(bundle?.project.status).toBe("preparing_space");
    expect(bundle?.project.selectedPetId).toBe(petProfile.id);
    expect(queuedTypes.map((row) => row.type)).toEqual([
      "pet-analysis",
      "pet-keyframe",
      "scene-classification"
    ]);
  });

  it("opens clarification only when analysis reports ambiguity", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      context
    );
    const job = getPetAnalysisJob(context.db);
    const provider = createProvider({
      async analyzePetIdentity() {
        return {
          petProfile: null,
          clarificationRequired: true,
          clarificationPrompt: "Which one should we bring into the memory?",
          raw: {}
        };
      }
    });

    await handlePetAnalysisJob(job!, {
      db: context.db,
      storage: context.storage,
      openAIProvider: provider
    });

    const bundle = getProjectBundle(result.project.id, context.db);
    const petGenerationJobs = context.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM generation_jobs
         WHERE project_id = ?
           AND type IN ('pet-keyframe', 'pet-video', 'quality-evaluation')`
      )
      .get(result.project.id) as { count: number };

    expect(bundle?.project.status).toBe("clarification_required");
    expect(bundle?.project.selectedPetId).toBeNull();
    expect(bundle?.petProfile?.clarificationRequired).toBe(true);
    expect(petGenerationJobs.count).toBe(0);
  });

  it("marks the project failed when final pet analysis attempt throws", async () => {
    const context = await createTestContext();
    const result = await createProjectFromUploads(
      [createImageUpload("one.jpg"), createImageUpload("two.jpg")],
      context
    );
    const job = getPetAnalysisJob(context.db);
    const provider = createProvider({
      async analyzePetIdentity() {
        throw new Error("provider schema rejected");
      }
    });

    await expect(
      handlePetAnalysisJob(
        {
          ...job!,
          maxAttempts: job!.attempts
        },
        {
          db: context.db,
          storage: context.storage,
          openAIProvider: provider
        }
      )
    ).rejects.toThrow("provider schema rejected");

    const bundle = getProjectBundle(result.project.id, context.db);
    expect(bundle?.project.status).toBe("failed");
    expect(bundle?.project.errorCode).toBe("PET_ANALYSIS_FAILED");
  });
});

async function createTestContext() {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-pet-analysis-"));
  const storageDir = path.join(tmpDir, "uploads");
  db = openDatabase(path.join(tmpDir, "test.sqlite"));

  return {
    db,
    storage: createLocalStorageDriver(storageDir)
  };
}

function createImageUpload(fileName: string) {
  return {
    fileName,
    contentType: "image/jpeg",
    size: 12,
    body: Buffer.from("image-bytes")
  };
}

function getPetAnalysisJob(db: DatabaseClient): GenerationJob {
  const row = db
    .prepare(
      "SELECT id FROM generation_jobs WHERE type = 'pet-analysis' ORDER BY created_at ASC LIMIT 1"
    )
    .get() as { id: string } | undefined;
  const job = row ? getGenerationJob(row.id, db) : null;

  if (!job) {
    throw new Error("Expected a queued pet-analysis job.");
  }

  return job;
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
    faceDescription: "soft face with dark eyes",
    bodyDescription: "small compact body",
    accessories: [],
    selectionConfidence: 0.93,
    clarificationRequired: false,
    clarificationAnswer: null
  };
}

function createProvider(
  overrides: Pick<OpenAIProvider, "analyzePetIdentity">
): OpenAIProvider {
  return {
    analyzePetIdentity: overrides.analyzePetIdentity,
    async generateImageSeed() {
      throw new Error("not reached");
    },
    async createRealtimeClientSecret() {
      throw new Error("not reached");
    }
  };
}
