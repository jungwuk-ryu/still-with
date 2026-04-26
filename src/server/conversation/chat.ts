import { requireOpenAIApiKey } from "@/lib/env";
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

const DEFAULT_CHAT_MODEL = "gpt-5.4";
const CHAT_INSTRUCTIONS = [
  "You are a gentle memory companion inside a 3D memorial space for a beloved pet.",
  "Use emotionally safe language.",
  "Never claim the pet is alive, sentient, resurrected, or speaking from an afterlife.",
  "Keep responses to one or two short sentences.",
  "If the user asks for motion, acknowledge it softly without describing technical animation."
].join(" ");

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
  const openAIReply = await createOpenAIReply(trimmedMessage, selectChatModel());
  const assistantMessage =
    openAIReply?.message ?? fallbackAssistantMessage(intent);

  return {
    message: trimmedMessage,
    assistantMessage,
    motion,
    petState,
    model: openAIReply?.model ?? null
  };
}

async function createOpenAIReply(
  message: string,
  model: string
): Promise<{ message: string; model: string } | null> {
  let apiKey: string;

  try {
    apiKey = requireOpenAIApiKey();
  } catch {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: CHAT_INSTRUCTIONS,
      input: message,
      max_output_tokens: 120
    })
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as
    | {
        output_text?: unknown;
        output?: Array<{
          content?: Array<{
            type?: string;
            text?: unknown;
          }>;
        }>;
      }
    | null;
  const outputText = extractResponseText(data);

  const assistantMessage = outputText.slice(0, 360);

  return assistantMessage ? { message: assistantMessage, model } : null;
}

function extractResponseText(
  data:
    | {
        output_text?: unknown;
        output?: Array<{
          content?: Array<{
            type?: string;
            text?: unknown;
          }>;
        }>;
      }
    | null
): string {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  const contentText = data?.output
    ?.flatMap((item) => item.content ?? [])
    .find(
      (content) =>
        content.type === "output_text" && typeof content.text === "string"
    )?.text;

  return typeof contentText === "string" ? contentText.trim() : "";
}

function selectChatModel(): string {
  const configuredModel = process.env.OPENAI_CHAT_MODEL?.trim();

  if (!configuredModel || configuredModel.includes("gpt-5.5")) {
    return DEFAULT_CHAT_MODEL;
  }

  return configuredModel;
}
