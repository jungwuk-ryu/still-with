import { randomUUID } from "node:crypto";
import { getDatabase, type DatabaseClient } from "@/server/db/connection";

const TOKEN_TTL_MS = 5 * 60 * 1000;

interface SpaceAccessTokenRow {
  token: string;
}

export function createSpaceAccessToken(
  projectId: string,
  now = Date.now(),
  db: DatabaseClient = getDatabase()
): string {
  ensureSpaceAccessTable(db);
  pruneExpiredTokens(now, db);

  const token = randomUUID();
  db.prepare(
    `INSERT INTO realtime_space_access_tokens (
      token, project_id, expires_at, created_at, consumed_at
    ) VALUES (?, ?, ?, ?, null)`
  ).run(token, projectId, toIso(now + TOKEN_TTL_MS), toIso(now));

  return token;
}

export function consumeSpaceAccessToken(
  projectId: string,
  token: string,
  now = Date.now(),
  db: DatabaseClient = getDatabase()
): boolean {
  ensureSpaceAccessTable(db);
  pruneExpiredTokens(now, db);

  const result = db
    .prepare(
      `UPDATE realtime_space_access_tokens
       SET consumed_at = ?
       WHERE token = ?
         AND project_id = ?
         AND consumed_at IS NULL
         AND expires_at > ?`
    )
    .run(toIso(now), token, projectId, toIso(now));

  return result.changes === 1;
}

export function hasSpaceAccessToken(
  projectId: string,
  token: string,
  now = Date.now(),
  db: DatabaseClient = getDatabase()
): boolean {
  ensureSpaceAccessTable(db);
  pruneExpiredTokens(now, db);

  const row = db
    .prepare(
      `SELECT token FROM realtime_space_access_tokens
       WHERE token = ?
         AND project_id = ?
         AND consumed_at IS NULL
         AND expires_at > ?
       LIMIT 1`
    )
    .get(token, projectId, toIso(now)) as SpaceAccessTokenRow | undefined;

  return Boolean(row);
}

export function getOpenSpaceAccessTokenCount(
  db: DatabaseClient = getDatabase(),
  now = Date.now()
): number {
  ensureSpaceAccessTable(db);
  pruneExpiredTokens(now, db);

  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM realtime_space_access_tokens
       WHERE consumed_at IS NULL`
    )
    .get() as { count: number };

  return row.count;
}

function ensureSpaceAccessTable(db: DatabaseClient) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS realtime_space_access_tokens (
      token TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      consumed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_realtime_space_access_project
      ON realtime_space_access_tokens(project_id, expires_at, consumed_at);
  `);
}

function pruneExpiredTokens(now: number, db: DatabaseClient) {
  db.prepare(
    `DELETE FROM realtime_space_access_tokens
     WHERE expires_at <= ? OR consumed_at IS NOT NULL`
  ).run(toIso(now));
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}
