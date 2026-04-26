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
import { createGenerationJob, getGenerationJob } from "./repository";
import { InProcessGenerationWorker } from "./worker";

let db: DatabaseClient | null = null;
let tmpDir: string | null = null;
let worker: InProcessGenerationWorker | null = null;

afterEach(async () => {
  await worker?.stop();
  worker = null;

  db?.close();
  db = null;

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("generation worker", () => {
  it("marks the project failed when a generation job exhausts attempts", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord(
      {
        status: "preparing_space",
        currentStage: "Letting the room come back"
      },
      db
    );
    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "space-seed",
        maxAttempts: 1
      },
      db
    );
    worker = new InProcessGenerationWorker({
      db,
      pollIntervalMs: 5,
      handlers: {
        "space-seed": async () => {
          throw new Error("seed generation timed out");
        }
      }
    });

    worker.start();
    await waitFor(() => {
      expect(getGenerationJob(job.id, db!)?.status).toBe("failed");
    });

    expect(getProjectRecord(project.id, db)).toMatchObject({
      status: "failed",
      currentStage: "Letting the room come back",
      currentStepIndex: 2,
      errorCode: "SPACE_SEED_FAILED",
      errorMessage: "seed generation timed out"
    });
  });
});

async function createTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-worker-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

async function waitFor(assertion: () => void, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  if (lastError) {
    throw lastError;
  }

  assertion();
}
