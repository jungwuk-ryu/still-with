import type Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

export function initializeDatabase(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
}
