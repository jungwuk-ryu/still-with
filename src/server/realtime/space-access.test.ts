import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseClient } from "@/server/db";
import {
  consumeSpaceAccessToken,
  createSpaceAccessToken,
  getOpenSpaceAccessTokenCount,
  hasSpaceAccessToken
} from "./space-access";

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-realtime-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}

describe("space access tokens", () => {
  it("consumes fresh project-scoped tokens once", async () => {
    db = await createTestDatabase();
    const now = Date.UTC(2026, 3, 26, 2, 0, 0);
    const token = createSpaceAccessToken("project-1", now, db);

    expect(hasSpaceAccessToken("project-1", token, now, db)).toBe(true);
    expect(consumeSpaceAccessToken("project-1", token, now, db)).toBe(true);
    expect(consumeSpaceAccessToken("project-1", token, now, db)).toBe(false);
    expect(hasSpaceAccessToken("project-1", token, now, db)).toBe(false);
  });

  it("rejects expired tokens", async () => {
    db = await createTestDatabase();
    const now = Date.UTC(2026, 3, 26, 2, 0, 0);
    const token = createSpaceAccessToken("project-1", now, db);

    expect(
      consumeSpaceAccessToken("project-1", token, now + 6 * 60 * 1000, db)
    ).toBe(false);
  });

  it("persists tokens across callers that share the database", async () => {
    db = await createTestDatabase();
    const now = Date.UTC(2026, 3, 26, 2, 0, 0);
    const token = createSpaceAccessToken("project-1", now, db);

    expect(getOpenSpaceAccessTokenCount(db, now)).toBe(1);
    expect(hasSpaceAccessToken("project-1", token, now, db)).toBe(true);
  });
});
