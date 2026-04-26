import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectRecord, openDatabase, type DatabaseClient } from "@/server/db";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  createGenerationJob,
  failGenerationJob,
  getGenerationJob
} from "./repository";

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

async function createTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-jobs-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

describe("generation job repository", () => {
  it("creates, claims, and completes SQLite-backed jobs", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);

    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "scene-classification",
        payload: { imageCount: 3 },
        priority: 5
      },
      db
    );

    const claimed = claimNextGenerationJob({ workerId: "test-worker" }, db);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);

    const completed = completeGenerationJob(job.id, { ok: true }, db);
    expect(completed?.status).toBe("succeeded");
    expect(completed?.result).toEqual({ ok: true });
  });

  it("retries failed jobs until maxAttempts is reached", async () => {
    db = await createTestDatabase();
    const project = createProjectRecord({}, db);

    const job = createGenerationJob(
      {
        projectId: project.id,
        type: "pet-analysis",
        maxAttempts: 1
      },
      db
    );

    claimNextGenerationJob({ workerId: "test-worker" }, db);
    const failed = failGenerationJob(
      {
        jobId: job.id,
        errorMessage: "No usable provider response.",
        retryDelayMs: 0
      },
      db
    );

    expect(failed?.status).toBe("failed");
    expect(getGenerationJob(job.id, db)?.errorCode).toBe("JOB_FAILED");
  });
});
