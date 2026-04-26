import type { GenerationJob, JsonValue, ProjectStatus } from "@/types";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob
} from "./repository";
import type { DatabaseClient } from "@/server/db";
import { getProjectRecord } from "@/server/db";
import { updateProjectLifecycle } from "@/server/projects/repository";
import {
  getLoadingStage,
  getStageIndexForJobType
} from "@/server/projects/stages";

export type GenerationJobHandler = (job: GenerationJob) => Promise<JsonValue | null>;

export interface InProcessWorkerOptions {
  db: DatabaseClient;
  workerId?: string;
  pollIntervalMs?: number;
  handlers: Partial<Record<GenerationJob["type"], GenerationJobHandler>>;
}

export class InProcessGenerationWorker {
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private readonly options: InProcessWorkerOptions) {
    this.workerId =
      options.workerId ??
      `worker-${process.pid}-${Math.random().toString(36).slice(2)}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs = this.pollIntervalMs): void {
    if (!this.running) {
      return;
    }

    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);

    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }

    const job = claimNextGenerationJob(
      { workerId: this.workerId },
      this.options.db
    );

    if (!job) {
      this.schedule();
      return;
    }

    const handler = this.options.handlers[job.type];

    if (!handler) {
      console.warn("[generation-job] missing handler", {
        jobId: job.id,
        projectId: job.projectId,
        type: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts
      });
      const failedJob = failGenerationJob(
        {
          jobId: job.id,
          errorCode: "NO_JOB_HANDLER",
          errorMessage: `No handler registered for job type ${job.type}.`,
          retryDelayMs: 0
        },
        this.options.db
      );
      if (failedJob?.status === "failed") {
        markProjectFailedFromJob(failedJob, this.options.db);
      }
      this.schedule(0);
      return;
    }

    const startedAt = Date.now();
    console.info("[generation-job] started", {
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      priority: job.priority
    });

    try {
      const result = await handler(job);
      completeGenerationJob(job.id, result, this.options.db);
      console.info("[generation-job] completed", {
        jobId: job.id,
        projectId: job.projectId,
        type: job.type,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      console.error("[generation-job] failed", {
        jobId: job.id,
        projectId: job.projectId,
        type: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Job handler failed."
      });
      const failedJob = failGenerationJob(
        {
          jobId: job.id,
          errorCode: "JOB_HANDLER_ERROR",
          errorMessage: error instanceof Error ? error.message : "Job handler failed."
        },
        this.options.db
      );

      if (failedJob?.status === "failed") {
        markProjectFailedFromJob(failedJob, this.options.db);
      }
    }

    this.schedule(0);
  }
}

function markProjectFailedFromJob(
  job: GenerationJob,
  db: DatabaseClient
): void {
  if (job.type === "conversation" || job.type === "completion-email") {
    return;
  }

  const project = getProjectRecord(job.projectId, db);

  if (!project || isTerminalProjectStatus(project.status)) {
    return;
  }

  const stage = getLoadingStage(getStageIndexForJobType(job.type));

  updateProjectLifecycle(
    job.projectId,
    {
      status: "failed",
      currentStage: stage.title,
      currentStepIndex: stage.index,
      errorCode: `${job.type.toUpperCase().replaceAll("-", "_")}_FAILED`,
      errorMessage: job.errorMessage ?? "Generation job failed."
    },
    db
  );
}

function isTerminalProjectStatus(status: ProjectStatus): boolean {
  return status === "ready" || status === "failed" || status === "cancelled";
}
