import type { DatabaseClient } from "@/server/db";
import { getDatabase } from "@/server/db";
import { sendProjectCompletionNotifications } from "@/server/projects/email-notifications";
import type { GenerationJob, JsonValue } from "@/types";

export interface CompletionEmailHandlerDeps {
  db?: DatabaseClient;
}

export async function handleCompletionEmailJob(
  job: GenerationJob,
  deps: CompletionEmailHandlerDeps = {}
): Promise<JsonValue> {
  const db = deps.db ?? getDatabase();
  const sentCount = await sendProjectCompletionNotifications(job.projectId, db, {
    throwOnFailure: true
  });

  return {
    sentCount
  };
}
