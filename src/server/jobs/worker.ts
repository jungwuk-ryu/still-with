import type { GenerationJob, JsonValue } from "@/types";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob
} from "./repository";
import type { DatabaseClient } from "@/server/db";

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
      failGenerationJob(
        {
          jobId: job.id,
          errorCode: "NO_JOB_HANDLER",
          errorMessage: `No handler registered for job type ${job.type}.`,
          retryDelayMs: 0
        },
        this.options.db
      );
      this.schedule(0);
      return;
    }

    try {
      const result = await handler(job);
      completeGenerationJob(job.id, result, this.options.db);
    } catch (error) {
      failGenerationJob(
        {
          jobId: job.id,
          errorCode: "JOB_HANDLER_ERROR",
          errorMessage: error instanceof Error ? error.message : "Job handler failed."
        },
        this.options.db
      );
    }

    this.schedule(0);
  }
}
