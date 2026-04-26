import { randomUUID } from "node:crypto";
import { getResendApiKey, getServerEnv } from "@/lib/env";
import {
  getDatabase,
  getProjectRecord,
  type DatabaseClient
} from "@/server/db";
import { createGenerationJob } from "@/server/jobs/repository";
import { sendResendEmail } from "@/server/providers/resend";

type ProjectEmailNotificationStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed";

interface ProjectEmailNotificationRow {
  id: string;
  project_id: string;
  email: string;
  normalized_email: string;
  status: ProjectEmailNotificationStatus;
  send_attempts: number;
  requested_at: string;
  updated_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
}

interface ProjectEmailNotification {
  id: string;
  projectId: string;
  email: string;
  normalizedEmail: string;
  status: ProjectEmailNotificationStatus;
  sendAttempts: number;
  requestedAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  lastError: string | null;
}

export interface CompletionEmailSubscriptionResult {
  alreadyReady: boolean;
  deliveryQueued: boolean;
  status: ProjectEmailNotificationStatus;
}

export class CompletionEmailSubscriptionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "CompletionEmailSubscriptionError";
  }
}

export async function subscribeToProjectCompletionEmail(
  projectId: string,
  email: string,
  db: DatabaseClient = getDatabase()
): Promise<CompletionEmailSubscriptionResult> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    throw new CompletionEmailSubscriptionError(
      "Enter a valid email address.",
      400
    );
  }

  if (!getResendApiKey()) {
    throw new CompletionEmailSubscriptionError(
      "Email notifications are not available right now.",
      503
    );
  }

  const project = getProjectRecord(projectId, db);

  if (!project) {
    throw new CompletionEmailSubscriptionError("Project not found.", 404);
  }

  if (project.status === "failed" || project.status === "cancelled") {
    throw new CompletionEmailSubscriptionError(
      "This memory is no longer being prepared.",
      409
    );
  }

  const notification = upsertProjectEmailNotification(
    projectId,
    email.trim(),
    normalizedEmail,
    db
  );

  if (project.status !== "ready") {
    return {
      alreadyReady: false,
      deliveryQueued: false,
      status: notification.status
    };
  }

  const deliveryQueued = enqueueProjectCompletionEmailJob(projectId, db);
  const latestNotification =
    getProjectEmailNotification(projectId, normalizedEmail, db) ?? notification;

  return {
    alreadyReady: true,
    deliveryQueued,
    status: latestNotification.status
  };
}

export async function sendProjectCompletionNotifications(
  projectId: string,
  db: DatabaseClient = getDatabase(),
  options: { throwOnFailure?: boolean } = {}
): Promise<number> {
  const project = getProjectRecord(projectId, db);

  if (!project || project.status !== "ready") {
    return 0;
  }

  const notifications = claimProjectEmailNotifications(projectId, db);

  if (notifications.length === 0) {
    return 0;
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const notification of notifications) {
    try {
      await sendResendEmail(
        buildCompletionEmail({
          to: notification.email,
          projectId
        })
      );
      markProjectEmailNotificationSent(notification.id, db);
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const message =
        error instanceof Error ? error.message : "Email delivery failed.";
      markProjectEmailNotificationFailed(notification.id, message, db);
      console.error("Project completion email failed", {
        projectId,
        notificationId: notification.id,
        error
      });
    }
  }

  if (failedCount > 0 && options.throwOnFailure) {
    throw new Error(
      `${failedCount} project completion email notification(s) failed.`
    );
  }

  return sentCount;
}

export function enqueueProjectCompletionEmailJob(
  projectId: string,
  db: DatabaseClient = getDatabase()
): boolean {
  const hasPendingNotification = Boolean(
    db
      .prepare(
        `SELECT 1
         FROM project_email_notifications
         WHERE project_id = ?
           AND status IN ('pending', 'failed')
         LIMIT 1`
      )
      .get(projectId)
  );

  if (!hasPendingNotification || hasActiveCompletionEmailJob(projectId, db)) {
    return false;
  }

  createGenerationJob(
    {
      projectId,
      type: "completion-email",
      priority: 4,
      maxAttempts: 5
    },
    db
  );

  return true;
}

export function hasProjectCompletionEmailSubscription(
  projectId: string,
  db: DatabaseClient = getDatabase()
): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1
         FROM project_email_notifications
         WHERE project_id = ?
           AND status IN ('pending', 'sending', 'sent', 'failed')
         LIMIT 1`
      )
      .get(projectId)
  );
}

function hasActiveCompletionEmailJob(
  projectId: string,
  db: DatabaseClient
): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1
         FROM generation_jobs
         WHERE project_id = ?
           AND type = 'completion-email'
           AND status IN ('queued', 'retrying', 'running')
         LIMIT 1`
      )
      .get(projectId)
  );
}

function upsertProjectEmailNotification(
  projectId: string,
  email: string,
  normalizedEmail: string,
  db: DatabaseClient
): ProjectEmailNotification {
  const now = new Date().toISOString();
  const notification: ProjectEmailNotification = {
    id: randomUUID(),
    projectId,
    email,
    normalizedEmail,
    status: "pending",
    sendAttempts: 0,
    requestedAt: now,
    updatedAt: now,
    lastAttemptAt: null,
    sentAt: null,
    lastError: null
  };

  db.prepare(
    `INSERT INTO project_email_notifications (
      id, project_id, email, normalized_email, status, send_attempts,
      requested_at, updated_at, last_attempt_at, sent_at, last_error
    ) VALUES (
      @id, @projectId, @email, @normalizedEmail, @status, @sendAttempts,
      @requestedAt, @updatedAt, @lastAttemptAt, @sentAt, @lastError
    )
    ON CONFLICT(project_id, normalized_email) DO UPDATE SET
      email = excluded.email,
      status = CASE
        WHEN status IN ('sent', 'sending')
          THEN status
        ELSE 'pending'
      END,
      updated_at = excluded.updated_at,
      last_error = CASE
        WHEN status IN ('sent', 'sending')
          THEN last_error
        ELSE NULL
      END`
  ).run(notification);

  return getProjectEmailNotification(projectId, normalizedEmail, db) ?? notification;
}

function getProjectEmailNotification(
  projectId: string,
  normalizedEmail: string,
  db: DatabaseClient
): ProjectEmailNotification | null {
  const row = db
    .prepare(
      `SELECT *
       FROM project_email_notifications
       WHERE project_id = ?
         AND normalized_email = ?`
    )
    .get(projectId, normalizedEmail) as ProjectEmailNotificationRow | undefined;

  return row ? mapProjectEmailNotificationRow(row) : null;
}

function claimProjectEmailNotifications(
  projectId: string,
  db: DatabaseClient
): ProjectEmailNotification[] {
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT *
         FROM project_email_notifications
         WHERE project_id = ?
           AND status IN ('pending', 'failed')
         ORDER BY requested_at ASC`
      )
      .all(projectId) as ProjectEmailNotificationRow[];

    if (rows.length === 0) {
      return [];
    }

    const markSending = db.prepare(
      `UPDATE project_email_notifications
       SET status = 'sending',
           send_attempts = send_attempts + 1,
           updated_at = ?,
           last_attempt_at = ?,
           last_error = NULL
       WHERE id = ?`
    );

    for (const row of rows) {
      markSending.run(now, now, row.id);
    }

    return rows.map(mapProjectEmailNotificationRow);
  });

  return transaction();
}

function markProjectEmailNotificationSent(
  notificationId: string,
  db: DatabaseClient
): void {
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE project_email_notifications
     SET status = 'sent',
         updated_at = ?,
         sent_at = ?,
         last_error = NULL
     WHERE id = ?`
  ).run(now, now, notificationId);
}

function markProjectEmailNotificationFailed(
  notificationId: string,
  message: string,
  db: DatabaseClient
): void {
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE project_email_notifications
     SET status = 'failed',
         updated_at = ?,
         last_error = ?
     WHERE id = ?`
  ).run(now, message.slice(0, 500), notificationId);
}

function buildCompletionEmail(input: {
  to: string;
  projectId: string;
}): {
  to: string;
  subject: string;
  text: string;
  html: string;
} {
  const spaceUrl = new URL(
    `/projects/${input.projectId}/space`,
    getServerEnv().appUrl
  ).toString();

  return {
    to: input.to,
    subject: "Your Still With memory space is ready",
    text: [
      "Your quiet memory space is ready when you are.",
      "",
      `Enter the space: ${spaceUrl}`,
      "",
      "Still With creates a gentle digital room from the photos you shared."
    ].join("\n"),
    html: [
      '<div style="font-family: Georgia, serif; color: #23201d; background: #f6efe6; padding: 28px;">',
      '<div style="max-width: 560px; margin: 0 auto; background: rgba(255,255,255,0.72); border: 1px solid rgba(80,64,48,0.16); border-radius: 24px; padding: 28px;">',
      '<p style="margin: 0 0 12px; color: #8b5d63; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Still With</p>',
      '<h1 style="margin: 0 0 16px; font-size: 28px; line-height: 1.2; font-weight: 500;">Your quiet memory space is ready when you are.</h1>',
      '<p style="margin: 0 0 24px; color: #5f5851; font-size: 16px; line-height: 1.6;">The room prepared from your photos is available now. Open it whenever you feel ready.</p>',
      `<a href="${escapeHtml(spaceUrl)}" style="display: inline-block; border-radius: 999px; background: #23201d; color: #ffffff; padding: 12px 18px; text-decoration: none; font-size: 14px;">Enter the space</a>`,
      '<p style="margin: 24px 0 0; color: #736b63; font-size: 13px; line-height: 1.5;">This is a single notification for this memory space.</p>',
      "</div>",
      "</div>"
    ].join("")
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mapProjectEmailNotificationRow(
  row: ProjectEmailNotificationRow
): ProjectEmailNotification {
  return {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    normalizedEmail: row.normalized_email,
    status: row.status,
    sendAttempts: row.send_attempts,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    lastError: row.last_error
  };
}
