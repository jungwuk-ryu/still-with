import {
  getExperienceManifest,
  updatePetRuntimeState
} from "./experience-manifest";
import {
  applyPlannedMotionSequence,
  fallbackAssistantMessage,
  planMotionQueueFromClips
} from "./motion";
import { selectMotionIntentWithAgent } from "./motion-agent";
import type { ConversationTurnResult } from "./types";

export async function createConversationTurn(
  projectId: string,
  message: string
): Promise<ConversationTurnResult> {
  const trimmedMessage = message.trim().slice(0, 1200);
  const manifest = getExperienceManifest(projectId, undefined, {
    issueAccessTokens: false
  });
  const decision = await selectMotionIntentWithAgent({
    message: trimmedMessage,
    motionClips: manifest.pet.motionClips,
    runtimeState: manifest.pet.runtimeState
  });
  const intent = decision.intent;
  const { plan, motionQueue } = planMotionQueueFromClips(
    intent,
    manifest.pet.motionClips,
    manifest.pet.runtimeState,
    trimmedMessage
  );
  const motion = motionQueue[0];
  const petState = updatePetRuntimeState(
    applyPlannedMotionSequence(
      manifest.pet.runtimeState,
      motionQueue,
      trimmedMessage,
      plan
    )
  );

  return {
    message: trimmedMessage,
    assistantMessage: fallbackAssistantMessage(intent),
    motion,
    motionQueue,
    petState,
    model: decision.model
  };
}
