import {
  getExperienceManifest,
  updatePetRuntimeState
} from "./experience-manifest";
import {
  applyPlannedMotion,
  fallbackAssistantMessage,
  planMotionFromClips
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
  const motion = planMotionFromClips(
    intent,
    manifest.pet.motionClips,
    manifest.pet.runtimeState
  );
  const petState = updatePetRuntimeState(
    applyPlannedMotion(manifest.pet.runtimeState, motion, trimmedMessage)
  );

  return {
    message: trimmedMessage,
    assistantMessage: fallbackAssistantMessage(intent),
    motion,
    petState,
    model: decision.model
  };
}
