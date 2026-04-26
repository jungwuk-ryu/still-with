import {
  getGeminiApiKey,
  getOpenAIApiKey,
  requireGeminiApiKey,
  requireOpenAIApiKey
} from "@/lib/env";
import { loadProviderImage } from "@/server/providers/image-inputs";
import { createLocalStorageDriver, type StorageDriver } from "@/server/storage";
import type { PetProfile } from "@/types";
import {
  buildBackgroundMusicPrompt,
  buildPetSoundEffectPrompt,
  PET_SOUND_EFFECT_INTENTS
} from "./prompts";

const DEFAULT_AUDIO_PROMPT_MODEL = "gpt-5.4";
const DEFAULT_GEMINI_AUDIO_PROMPT_MODEL = "gemini-3.1-pro";
const MAX_AUDIO_PROMPT_IMAGES = 6;

export interface AudioPromptPlan {
  backgroundMusicPrompt: string;
  petSoundEffects: Record<(typeof PET_SOUND_EFFECT_INTENTS)[number], string>;
  model: string | null;
  source: "llm" | "fallback";
}

export interface AudioPromptPlanningInput {
  projectId: string;
  petProfile: PetProfile;
  sceneLabel: string | null;
  spatialPrompt: string | null;
  imageUrls: string[];
}

export interface AudioPromptPlanner {
  planAudioPrompts(input: AudioPromptPlanningInput): Promise<AudioPromptPlan>;
}

export interface AudioPromptPlannerOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  storage?: StorageDriver;
}

interface ImageReference {
  dataUrl: string;
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export function createAudioPromptPlanner(
  options: AudioPromptPlannerOptions = {}
): AudioPromptPlanner | null {
  const configuredModel = options.model ?? process.env.AUDIO_PROMPT_MODEL?.trim();

  if (configuredModel?.toLowerCase().startsWith("gemini")) {
    if (!options.apiKey && !getGeminiApiKey()) {
      return null;
    }

    return new GeminiAudioPromptPlanner({
      ...options,
      model: configuredModel
    });
  }

  if (options.apiKey || getOpenAIApiKey()) {
    return new OpenAIAudioPromptPlanner({
      ...options,
      model: configuredModel || DEFAULT_AUDIO_PROMPT_MODEL
    });
  }

  if (getGeminiApiKey()) {
    return new GeminiAudioPromptPlanner({
      ...options,
      model: configuredModel || DEFAULT_GEMINI_AUDIO_PROMPT_MODEL
    });
  }

  return null;
}

export function buildFallbackAudioPromptPlan(
  input: Omit<AudioPromptPlanningInput, "projectId" | "imageUrls">
): AudioPromptPlan {
  return {
    backgroundMusicPrompt: buildBackgroundMusicPrompt(input),
    petSoundEffects: Object.fromEntries(
      PET_SOUND_EFFECT_INTENTS.map((intent) => [
        intent,
        buildPetSoundEffectPrompt({
          intent,
          petProfile: input.petProfile
        })
      ])
    ) as AudioPromptPlan["petSoundEffects"],
    model: null,
    source: "fallback"
  };
}

class OpenAIAudioPromptPlanner implements AudioPromptPlanner {
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly storage: StorageDriver;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: AudioPromptPlannerOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model = options.model || DEFAULT_AUDIO_PROMPT_MODEL;
    this.storage = options.storage ?? createLocalStorageDriver();
    this.apiBaseUrl = options.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
  }

  async planAudioPrompts(input: AudioPromptPlanningInput): Promise<AudioPromptPlan> {
    const imageReferences = await getImageReferences(input, this.storage, this.fetchImpl);
    const raw = await this.postJson<OpenAIResponse>(
      "/responses",
      {
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: buildAudioPromptPlannerSystemInstructions()
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildAudioPromptPlannerUserPrompt(input)
              },
              ...imageReferences.map((image) => ({
                type: "input_image",
                image_url: image.dataUrl
              }))
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "still_with_audio_prompt_plan",
            strict: false,
            schema: AUDIO_PROMPT_PLAN_SCHEMA
          }
        }
      }
    );

    return coerceAudioPromptPlan(
      parseOpenAIJsonOutput(raw),
      this.model,
      buildFallbackAudioPromptPlan(input)
    );
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireOpenAIApiKey();
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`OpenAI audio prompt planning failed with ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}

class GeminiAudioPromptPlanner implements AudioPromptPlanner {
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly storage: StorageDriver;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: AudioPromptPlannerOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model = options.model || DEFAULT_GEMINI_AUDIO_PROMPT_MODEL;
    this.storage = options.storage ?? createLocalStorageDriver();
    this.apiBaseUrl =
      options.apiBaseUrl?.replace(/\/$/, "") ??
      "https://generativelanguage.googleapis.com/v1beta";
  }

  async planAudioPrompts(input: AudioPromptPlanningInput): Promise<AudioPromptPlan> {
    const imageReferences = await getImageReferences(input, this.storage, this.fetchImpl);
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.requireApiKey())}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    buildAudioPromptPlannerSystemInstructions(),
                    buildAudioPromptPlannerUserPrompt(input)
                  ].join("\n\n")
                },
                ...imageReferences.map((image) => ({
                  inlineData: image.inlineData
                }))
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini audio prompt planning failed with ${response.status}.`);
    }

    const raw = (await response.json()) as GeminiResponse;
    return coerceAudioPromptPlan(
      parseGeminiJsonOutput(raw),
      this.model,
      buildFallbackAudioPromptPlan(input)
    );
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireGeminiApiKey();
  }
}

async function getImageReferences(
  input: AudioPromptPlanningInput,
  storage: StorageDriver,
  fetchImpl: typeof fetch
): Promise<ImageReference[]> {
  const references: ImageReference[] = [];

  for (const imageUrl of input.imageUrls.slice(0, MAX_AUDIO_PROMPT_IMAGES)) {
    try {
      const image = await loadProviderImage(imageUrl, {
        projectId: input.projectId,
        storage,
        fetchImpl
      });
      const contentType = normalizeImageContentType(image.contentType);

      if (!contentType) {
        continue;
      }

      const data = image.body.toString("base64");
      references.push({
        dataUrl: `data:${contentType};base64,${data}`,
        inlineData: {
          mimeType: contentType,
          data
        }
      });
    } catch {
      continue;
    }
  }

  return references;
}

function buildAudioPromptPlannerSystemInstructions(): string {
  return [
    "You design audio prompts for Still With, a private memorial experience for companion-animal loss.",
    "Use the supplied pet and room images plus structured project context.",
    "Return valid JSON only.",
    "Never imply resurrection, sentience, an afterlife, or that the pet is alive.",
    "Do not use artist names, song titles, copyrighted lyrics, celebrity references, or branded sonic references.",
    "Background music must be instrumental, gentle, sparse, and suitable for quiet looping.",
    "Pet sound effects must be short, realistic, situational, and subtle. No human voices or words."
  ].join("\n");
}

function buildAudioPromptPlannerUserPrompt(input: AudioPromptPlanningInput): string {
  return [
    "Create one background music prompt and one short sound-effect prompt for each motion intent.",
    `Scene label: ${input.sceneLabel ?? "unknown"}`,
    `Scene description: ${input.spatialPrompt ?? "unknown"}`,
    `Pet species: ${input.petProfile.species ?? "unknown"}`,
    `Pet traits: ${input.petProfile.traitSummary}`,
    `Face: ${input.petProfile.faceDescription ?? "unknown"}`,
    `Body: ${input.petProfile.bodyDescription ?? "unknown"}`,
    `Markings: ${input.petProfile.distinctiveMarkings.join(", ") || "none"}`,
    `Accessories: ${input.petProfile.accessories.join(", ") || "none"}`,
    "Required JSON keys: backgroundMusicPrompt, petSoundEffects.look_at_me, petSoundEffects.turn_around, petSoundEffects.sit, petSoundEffects.come_closer."
  ].join("\n");
}

function coerceAudioPromptPlan(
  raw: unknown,
  model: string,
  fallback: AudioPromptPlan
): AudioPromptPlan {
  const record = asRecord(raw);
  const petSoundEffects = asRecord(record.petSoundEffects);

  return {
    backgroundMusicPrompt:
      getPromptString(record.backgroundMusicPrompt) ??
      fallback.backgroundMusicPrompt,
    petSoundEffects: Object.fromEntries(
      PET_SOUND_EFFECT_INTENTS.map((intent) => [
        intent,
        getPromptString(petSoundEffects[intent]) ??
          fallback.petSoundEffects[intent]
      ])
    ) as AudioPromptPlan["petSoundEffects"],
    model,
    source: "llm"
  };
}

function normalizeImageContentType(contentType: string): string | null {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();

  if (
    normalized === "image/png" ||
    normalized === "image/jpeg" ||
    normalized === "image/webp"
  ) {
    return normalized;
  }

  return null;
}

function getPromptString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1400) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface OpenAIResponse {
  output?: unknown[];
  output_text?: string;
}

function parseOpenAIJsonOutput(raw: OpenAIResponse): unknown {
  const outputText = raw.output_text ?? findFirstString(raw.output);

  if (!outputText) {
    throw new Error("OpenAI audio prompt planning returned no text.");
  }

  return JSON.parse(outputText) as unknown;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

function parseGeminiJsonOutput(raw: GeminiResponse): unknown {
  const outputText =
    raw.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n") ?? "";

  if (!outputText.trim()) {
    throw new Error("Gemini audio prompt planning returned no text.");
  }

  return JSON.parse(outputText) as unknown;
}

function findFirstString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item);
      if (found) {
        return found;
      }
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      getPromptString(record.output_text) ??
      getPromptString(record.text) ??
      findFirstString(record.content)
    );
  }

  return null;
}

export const AUDIO_PROMPT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    backgroundMusicPrompt: {
      type: "string"
    },
    petSoundEffects: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        PET_SOUND_EFFECT_INTENTS.map((intent) => [
          intent,
          {
            type: "string"
          }
        ])
      )
    }
  },
  required: ["backgroundMusicPrompt", "petSoundEffects"]
} as const;
