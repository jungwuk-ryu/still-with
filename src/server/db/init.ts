import type Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

export function initializeDatabase(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  ensureProjectColumns(db);
  ensureMotionClipColumns(db);
}

function ensureProjectColumns(db: Database.Database): void {
  ensureColumns(db, "projects", [["selected_pet_id", "TEXT"]]);
}

function ensureMotionClipColumns(db: Database.Database): void {
  ensureColumns(db, "motion_clips", [
    ["provider_operation_id", "TEXT"],
    ["provider_status", "TEXT"],
    ["provider_error_message", "TEXT"],
    ["postprocess_json", "TEXT"]
  ]);
}

function ensureColumns(
  db: Database.Database,
  tableName: string,
  additions: Array<[string, string]>
): void {
  const columns = new Set(
    (
      db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name: string;
      }>
    ).map((row) => row.name)
  );

  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`).run();
    }
  }
}
