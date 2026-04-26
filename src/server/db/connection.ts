import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getSqlitePath } from "@/lib/env";
import { initializeDatabase } from "./init";

export type DatabaseClient = Database.Database;

let defaultDatabase: DatabaseClient | null = null;

export interface OpenDatabaseOptions {
  initialize?: boolean;
}

export function openDatabase(
  databasePath = getSqlitePath(),
  options: OpenDatabaseOptions = {}
): DatabaseClient {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (options.initialize !== false) {
    initializeDatabase(db);
  }

  return db;
}

export function getDatabase(): DatabaseClient {
  if (!defaultDatabase) {
    defaultDatabase = openDatabase();
  }

  return defaultDatabase;
}

export function closeDefaultDatabase(): void {
  if (defaultDatabase) {
    defaultDatabase.close();
    defaultDatabase = null;
  }
}
