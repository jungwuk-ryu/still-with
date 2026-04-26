import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectRecord,
  openDatabase,
  type DatabaseClient
} from "@/server/db";
import {
  subscribeToProjectCompletionEmail
} from "./email-notifications";

let db: DatabaseClient | null = null;
let tmpDir: string | null = null;
const originalResendApiKey = process.env.RESEND_API_KEY;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(async () => {
  if (originalResendApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalResendApiKey;
  }

  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }

  db?.close();
  db = null;

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("project completion email notifications", () => {
  it("stores one normalized pending notification for an in-progress project", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://stillwith.example";
    db = await openTestDatabase();
    const project = createProjectRecord({ status: "preparing_pet" }, db);

    await subscribeToProjectCompletionEmail(
      project.id,
      "Memory@Example.COM ",
      db
    );
    const result = await subscribeToProjectCompletionEmail(
      project.id,
      "memory@example.com",
      db
    );
    const rows = db
      .prepare(
        `SELECT email, normalized_email, status, send_attempts
         FROM project_email_notifications
         WHERE project_id = ?`
      )
      .all(project.id) as Array<{
      email: string;
      normalized_email: string;
      status: string;
      send_attempts: number;
    }>;

    expect(result).toEqual({
      alreadyReady: false,
      deliveryQueued: false,
      status: "pending"
    });
    expect(rows).toEqual([
      {
        email: "memory@example.com",
        normalized_email: "memory@example.com",
        status: "pending",
        send_attempts: 0
      }
    ]);
  });

  it("rejects invalid completion email subscriptions", async () => {
    db = await openTestDatabase();
    const project = createProjectRecord({ status: "preparing_pet" }, db);

    await expect(
      subscribeToProjectCompletionEmail(project.id, "not-an-email", db)
    ).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it("queues a completion email job when the project is already ready", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://stillwith.example";
    db = await openTestDatabase();
    const project = createProjectRecord({ status: "ready" }, db);

    const result = await subscribeToProjectCompletionEmail(
      project.id,
      "memory@example.com",
      db
    );
    const job = db
      .prepare(
        `SELECT type, status
         FROM generation_jobs
         WHERE project_id = ?`
      )
      .get(project.id) as { type: string; status: string } | undefined;

    expect(result).toEqual({
      alreadyReady: true,
      deliveryQueued: true,
      status: "pending"
    });
    expect(job).toEqual({
      type: "completion-email",
      status: "queued"
    });
  });

  it("rejects subscriptions when email delivery is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NEXT_PUBLIC_APP_URL = "https://stillwith.example";
    db = await openTestDatabase();
    const project = createProjectRecord({ status: "preparing_pet" }, db);

    await expect(
      subscribeToProjectCompletionEmail(project.id, "memory@example.com", db)
    ).rejects.toMatchObject({
      statusCode: 503
    });
  });
});

async function openTestDatabase(): Promise<DatabaseClient> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-email-"));
  return openDatabase(path.join(tmpDir, "test.sqlite"));
}
