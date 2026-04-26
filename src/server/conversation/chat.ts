import {
  getExperienceManifest,
  updatePetRuntimeState
} from "./experience-manifest";
import {
  applyPlannedMotion,
  fallbackAssistantMessage,
  inferMotionIntent,
  planMotionFromClips
} from "./motion";
import type { ConversationTurnResult } from "./types";

export async function createConversationTurn(
  projectId: string,
  message: string
): Promise<ConversationTurnResult> {
  const trimmedMessage = message.trim().slice(0, 1200);
  const manifest = getExperienceManifest(projectId, undefined, {
    issueAccessTokens: false
  });
  const intent = inferMotionIntent(trimmedMessage);
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
    model: null
  };
}
