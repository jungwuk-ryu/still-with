import { getGeminiApiKey, requireGeminiApiKey } from "@/lib/env";

const DEFAULT_GEMINI_PET_PRESENCE_MODEL = "gemini-3-pro-preview";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const PET_PRESENCE_BATCH_SIZE = 4;

export const NO_PET_UPLOAD_MESSAGE =
  "We could not find a pet in these photos. Add at least one clear photo of your pet so we can build the memory space around them.";

export const PET_PRESENCE_CHECK_UNAVAILABLE_MESSAGE =
  "We could not check these photos just now. Please try again in a moment.";

export interface PetPresenceImage {
  fileName: string;
  mimeType: string;
  body: Buffer;
}

export interface PetPresenceDetectionInput {
  images: PetPresenceImage[];
}

export interface PetPresenceDetectionResult {
  hasPet: boolean;
  confidence: "high" | "medium" | "low";
  reason: string | null;
  raw?: unknown;
}

export interface PetPresenceDetector {
  detectPetPresence(
    input: PetPresenceDetectionInput
  ): Promise<PetPresenceDetectionResult>;
}

export interface GeminiPetPresenceDetectorOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

export function createGeminiPetPresenceDetector(
  options: GeminiPetPresenceDetectorOptions = {}
): PetPresenceDetector | null {
  if (!options.apiKey && !getGeminiApiKey()) {
    return null;
  }

  return new GeminiPetPresenceDetector(options);
}

class GeminiPetPresenceDetector implements PetPresenceDetector {
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: GeminiPetPresenceDetectorOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model =
      options.model ||
      process.env.PET_PRESENCE_MODEL?.trim() ||
      DEFAULT_GEMINI_PET_PRESENCE_MODEL;
    this.apiBaseUrl =
      options.apiBaseUrl?.replace(/\/$/, "") ?? GEMINI_API_BASE_URL;
  }

  async detectPetPresence(
    input: PetPresenceDetectionInput
  ): Promise<PetPresenceDetectionResult> {
    const images = input.images.filter((image) => image.body.length > 0);
    const batchReasons: string[] = [];
    let raw: unknown = null;

    for (let index = 0; index < images.length; index += PET_PRESENCE_BATCH_SIZE) {
      const batch = images.slice(index, index + PET_PRESENCE_BATCH_SIZE);
      const result = await this.detectBatch(batch, index);

      raw = result.raw;

      if (result.reason) {
        batchReasons.push(result.reason);
      }

      if (result.hasPet) {
        return result;
      }
    }

    return {
      hasPet: false,
      confidence: "high",
      reason:
        batchReasons.find((reason) => reason.trim().length > 0) ??
        "No plausible companion animal was visible in the uploaded images.",
      raw
    };
  }

  private async detectBatch(
    images: PetPresenceImage[],
    startIndex: number
  ): Promise<PetPresenceDetectionResult> {
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.requireApiKey(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPetPresencePrompt(images, startIndex)
                },
                ...images.map((image) => ({
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.body.toString("base64")
                  }
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
      throw new Error(`Gemini pet presence check failed with ${response.status}.`);
    }

    const raw = (await response.json()) as GeminiResponse;
    return coercePetPresenceResult(parseGeminiJsonOutput(raw), raw);
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireGeminiApiKey();
  }
}

function buildPetPresencePrompt(
  images: PetPresenceImage[],
  startIndex: number
): string {
  return [
    "You are checking uploaded photos for Still With, a private companion-animal memorial experience.",
    "Return valid JSON only.",
    "Determine whether any real companion animal or pet is visibly present in any supplied image.",
    "Count dogs, cats, birds, rabbits, hamsters, reptiles, fish, horses, and other plausible companion animals.",
    "If there is a plausible visible pet but the image is blurry, partially cropped, or species is uncertain, set hasPet to true.",
    "Set hasPet to false only when no plausible pet is visible in any supplied image.",
    "Do not count people, empty rooms, landscapes, stuffed animals, toys, statues, logos, cartoons, paintings, text, or animal-shaped decor.",
    "Required JSON shape: {\"hasPet\": boolean, \"confidence\": \"high\" | \"medium\" | \"low\", \"reason\": string}.",
    `Images in this request: ${images
      .map((_, index) => `image ${startIndex + index + 1}`)
      .join(", ")}.`
  ].join("\n");
}

function coercePetPresenceResult(
  raw: unknown,
  response: GeminiResponse
): PetPresenceDetectionResult {
  const record = asRecord(raw);
  const confidence = getConfidence(record.confidence);

  if (typeof record.hasPet !== "boolean") {
    throw new Error("Gemini pet presence check returned an invalid shape.");
  }

  return {
    hasPet: record.hasPet,
    confidence,
    reason: typeof record.reason === "string" ? record.reason.slice(0, 500) : null,
    raw: response
  };
}

function getConfidence(value: unknown): PetPresenceDetectionResult["confidence"] {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
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
    throw new Error("Gemini pet presence check returned no text.");
  }

  return JSON.parse(stripJsonFence(outputText)) as unknown;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
