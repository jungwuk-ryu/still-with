import { getOpenAIApiKey } from "@/lib/env";
import {
  PET_MOTION_DEFINITIONS,
  type PetMotionKey
} from "@/pet/motion-set";
import { inferMotionKeyFromCommand } from "@/pet/transition-planner";
import type { MotionClip, PetRuntimeState } from "@/types";
import type { MotionIntentKey } from "./types";

const DEFAULT_MOTION_AGENT_MODEL = "gpt-5.4";
const MOTION_AGENT_TIMEOUT_MS = 4_500;

interface MotionIntentAgentInput {
  message: string;
  motionClips: readonly MotionClip[];
  runtimeState: PetRuntimeState;
}

interface MotionIntentAgentOptions {
  apiKey?: string | null;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

export interface MotionIntentDecision {
  intent: MotionIntentKey;
  model: string | null;
  source: "llm" | "fallback";
}

export async function selectMotionIntentWithAgent(
  input: MotionIntentAgentInput,
  options: MotionIntentAgentOptions = {}
): Promise<MotionIntentDecision> {
  const fallbackIntent = inferFallbackIntent(input.message);
  const apiKey =
    options.apiKey === undefined ? getOpenAIApiKey() : options.apiKey;

  if (!apiKey) {
    return {
      intent: fallbackIntent,
      model: null,
      source: "fallback"
    };
  }

  const model =
    options.model ??
    process.env.OPENAI_MOTION_MODEL?.trim() ??
    process.env.OPENAI_CHAT_MODEL?.trim() ??
    DEFAULT_MOTION_AGENT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl =
    options.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    MOTION_AGENT_TIMEOUT_MS
  );

  try {
    const response = await fetchImpl(`${apiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions: buildMotionAgentInstructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(buildMotionAgentPayload(input))
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "still_with_motion_intent",
            strict: true,
            schema: MOTION_INTENT_SCHEMA
          }
        }
      }),
      signal: abortController.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        intent: fallbackIntent,
        model: null,
        source: "fallback"
      };
    }

    const raw = (await response.json()) as OpenAIResponse;
    const parsed = parseJsonOutput(raw);
    const intent = coerceMotionIntent(getRecord(parsed).intent);

    return {
      intent: intent ?? fallbackIntent,
      model: intent ? model : null,
      source: intent ? "llm" : "fallback"
    };
  } catch {
    clearTimeout(timeout);
    return {
      intent: fallbackIntent,
      model: null,
      source: "fallback"
    };
  }
}

function buildMotionAgentInstructions(): string {
  return [
    "You are the motion selection agent for Still With, a respectful companion-animal memory space.",
    "Read the user's natural-language message in any language and choose exactly one allowed motion intent.",
    "Use semantic meaning, the current pet pose, and the available motion contract. Do not answer as the pet.",
    "If the user asks the pet to sit, settle down, rest in a seated pose, or gives an equivalent command in another language, choose sit.",
    "If the user asks the pet to come near, choose come_closer. If they ask for a spin or turn, choose turn_around. If they ask for attention or eye contact, choose look_at_me.",
    "If the message is affectionate or ambiguous but directed at the pet, choose look_at_me. If it is empty or has no pet-directed action, choose idle.",
    "Return JSON only."
  ].join("\n");
}

function buildMotionAgentPayload(input: MotionIntentAgentInput) {
  return {
    message: input.message,
    currentPetPose: input.runtimeState.currentPose,
    allowedIntents: ["idle", "look_at_me", "turn_around", "sit", "come_closer"],
    availableMotionContract: buildAvailableMotionContract(input.motionClips)
  };
}

function buildAvailableMotionContract(motionClips: readonly MotionClip[]) {
  const readyMotionKeys = new Set(
    motionClips
      .filter((clip) => clip.status === "ready")
      .map((clip) => clip.motionKey)
  );

  return Object.values(PET_MOTION_DEFINITIONS).map((definition) => ({
    motionKey: definition.key,
    available: readyMotionKeys.has(definition.key),
    fromState: definition.fromState,
    toState: definition.toState,
    category: definition.category,
    loopable: definition.loopable,
    description: definition.description,
    aliases: definition.aliases
  }));
}

function inferFallbackIntent(message: string): MotionIntentKey {
  const trimmed = message.trim();

  if (!trimmed) {
    return "idle";
  }

  const inferredMotionKey =
    inferMotionKeyFromCommand(trimmed) ??
    inferAdditionalEnglishMotionKey(trimmed) ??
    inferKoreanMotionKey(trimmed);

  switch (inferredMotionKey) {
    case "stand_to_sit":
    case "sit":
      return "sit";
    case "sit_to_stand":
    case "stand_idle":
      return "idle";
    case "turn_360":
      return "turn_around";
    case "walk_small":
      return "come_closer";
    case "look_at_camera":
      return "look_at_me";
    default:
      return "look_at_me";
  }
}

function inferAdditionalEnglishMotionKey(message: string): PetMotionKey | null {
  const normalized = message.toLowerCase().replace(/[_-]+/g, " ").trim();

  if (/\bcome\b/.test(normalized)) {
    return "walk_small";
  }

  return null;
}

function inferKoreanMotionKey(message: string): PetMotionKey | null {
  const normalized = message.toLowerCase().replace(/\s+/g, " ");

  if (/기다려|멈춰|가만히|쉬어/.test(normalized)) {
    return "stand_idle";
  }

  if (/앉/.test(normalized)) {
    return "stand_to_sit";
  }

  if (/일어나|서 ?봐|서 ?줘|서있|서 있어|기상/.test(normalized)) {
    return "stand_idle";
  }

  if (/돌아|회전|빙글|턴|한 ?바퀴/.test(normalized)) {
    return "turn_360";
  }

  if (/이리 ?와|가까이|다가와|걸어|앞으로|와 ?줘/.test(normalized)) {
    return "walk_small";
  }

  if (/봐|쳐다|여기|눈 ?맞|카메라/.test(normalized)) {
    return "look_at_camera";
  }

  return null;
}

function coerceMotionIntent(value: unknown): MotionIntentKey | null {
  return value === "idle" ||
    value === "look_at_me" ||
    value === "turn_around" ||
    value === "sit" ||
    value === "come_closer"
    ? value
    : null;
}

interface OpenAIResponse {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: unknown;
    }>;
  }>;
}

function parseJsonOutput(response: OpenAIResponse): unknown {
  const outputText =
    typeof response.output_text === "string"
      ? response.output_text
      : response.output
          ?.flatMap((item) => item.content ?? [])
          .find(
            (content) =>
              content.type === "output_text" && typeof content.text === "string"
          )?.text;

  if (typeof outputText !== "string") {
    return null;
  }

  try {
    return JSON.parse(outputText);
  } catch {
    return null;
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const MOTION_INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "confidence", "reason"],
  properties: {
    intent: {
      type: "string",
      enum: ["idle", "look_at_me", "turn_around", "sit", "come_closer"]
    },
    confidence: {
      type: "number"
    },
    reason: {
      type: "string"
    }
  }
};
