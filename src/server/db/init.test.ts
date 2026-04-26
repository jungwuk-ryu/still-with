import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseClient } from "./connection";

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

describe("initializeDatabase", () => {
  it("creates the Foundation schema in a local SQLite file", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-db-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
         ORDER BY name`
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toContain("projects");
    expect(tables.map((table) => table.name)).toContain("generation_jobs");
    expect(tables.map((table) => table.name)).toContain("world_assets");
  });
});
