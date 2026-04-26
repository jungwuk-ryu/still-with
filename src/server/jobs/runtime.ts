import { getDatabase } from "@/server/db";
import { handleCompletionEmailJob } from "./completion-email/handler";
import { createDreamFragmentHandler } from "./dream-fragment/handler";
import { handleElevenLabsAudioJob } from "./elevenlabs-audio/handler";
import { handlePetAnalysisJob } from "./pet-analysis/handler";
import { handlePetKeyframeJob } from "./pet-keyframes/handler";
import { handlePetVideoJob } from "./pet-video/handler";
import { createSpacePipelineHandlers } from "./worldlabs/pipeline";
import { InProcessGenerationWorker } from "./worker";

let worker: InProcessGenerationWorker | null = null;

export function ensureGenerationWorkerStarted(): void {
  if (worker) {
    return;
  }

  const db = getDatabase();
  worker = new InProcessGenerationWorker({
    db,
    workerId: `next-worker-${process.pid}`,
    pollIntervalMs: 1_500,
    handlers: {
      "pet-analysis": (job) => handlePetAnalysisJob(job, { db }),
      "pet-keyframe": (job) => handlePetKeyframeJob(job, { db }),
      "pet-video": (job) => handlePetVideoJob(job, { db }),
      "elevenlabs-audio": (job) => handleElevenLabsAudioJob(job, { db }),
      "dream-fragment": createDreamFragmentHandler({ db }),
      "completion-email": (job) => handleCompletionEmailJob(job, { db }),
      ...createSpacePipelineHandlers({ db })
    }
  });
  worker.start();
}
