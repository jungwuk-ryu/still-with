import { requireOpenAIApiKey } from "@/lib/env";
import {
  assertRemoteProviderImageUrlAllowed,
  loadProviderImage,
  storageKeyFromProviderImageUrl
} from "@/server/providers/image-inputs";
import { createLocalStorageDriver } from "@/server/storage";
import type { StorageDriver } from "@/server/storage";
import type { UploadedImage } from "@/types";
import {
  buildSceneClassificationPrompt,
  createFallbackSceneClassification,
  normalizeSceneClassificationResult,
  parseJsonObjectFromText
} from "./prompt";
import type {
  SceneClassificationResult,
  SceneClassifier,
  SceneClassifierInput
} from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_SCENE_MODEL = "gpt-5.4";

export interface OpenAISceneClassifierOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  storage?: StorageDriver;
  useFallbackOnInvalidJson?: boolean;
}

export class OpenAISceneClassifier implements SceneClassifier {
  private readonly fetchImpl: typeof fetch;
  private readonly storage: StorageDriver;

  constructor(private readonly options: OpenAISceneClassifierOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.storage = options.storage ?? createLocalStorageDriver();
  }

  async classify(input: SceneClassifierInput): Promise<SceneClassificationResult> {
    const apiKey = this.options.apiKey ?? requireOpenAIApiKey();
    const response = await this.fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model ?? process.env.OPENAI_SCENE_MODEL ?? DEFAULT_SCENE_MODEL,
        instructions:
          "You classify uploaded photos into scene clusters for a respectful pet memory space. Return JSON only.",
        input: [
          {
            role: "user",
            content: await this.buildContent(input.images)
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "scene_classification",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["primaryCluster", "clusters"],
              properties: {
                primaryCluster: { $ref: "#/$defs/sceneCluster" },
                clusters: {
                  type: "array",
                  items: { $ref: "#/$defs/sceneCluster" }
                }
              },
              $defs: {
                sceneCluster: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "label",
                    "sourceImageIds",
                    "representativeImageIds",
                    "directWorldInputImageIds",
                    "spatialPrompt",
                    "visualEvidence",
                    "seedStrategy",
                    "confidence"
                  ],
                  properties: {
                    label: { type: "string" },
                    sourceImageIds: { type: "array", items: { type: "string" } },
                    representativeImageIds: {
                      type: "array",
                      items: { type: "string" }
                    },
                    directWorldInputImageIds: {
                      type: "array",
                      items: { type: "string" }
                    },
                    spatialPrompt: { type: "string" },
                    visualEvidence: { type: "array", items: { type: "string" } },
                    seedStrategy: {
                      type: "string",
                      enum: [
                        "direct-multi-image",
                        "generated-multiview",
                        "generated-panorama"
                      ]
                    },
                    confidence: { type: "number" }
                  }
                }
              }
            },
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI scene classification failed with HTTP ${response.status}.`);
    }

    const raw = (await response.json()) as unknown;
    const outputText = extractOutputText(raw);

    try {
      const parsed = parseJsonObjectFromText(outputText);
      return normalizeSceneClassificationResult(input.projectId, input.images, parsed);
    } catch (error) {
      if (this.options.useFallbackOnInvalidJson) {
        return createFallbackSceneClassification(input.projectId, input.images, raw);
      }

      throw error;
    }
  }

  private async buildContent(images: UploadedImage[]): Promise<Array<Record<string, string>>> {
    const content: Array<Record<string, string>> = [
      {
        type: "input_text",
        text: buildSceneClassificationPrompt(images)
      }
    ];

    for (const image of images.slice(0, 12)) {
      content.push({
        type: "input_image",
        image_url: await toOpenAIImageUrl(image, this.storage)
      });
    }

    return content;
  }
}

async function toOpenAIImageUrl(
  image: UploadedImage,
  storage: StorageDriver
): Promise<string> {
  const imageUrl = image.originalUrl;

  if (imageUrl.startsWith("data:") || /^https?:\/\//.test(imageUrl)) {
    if (/^https?:\/\//.test(imageUrl)) {
      await assertRemoteProviderImageUrlAllowed(imageUrl);
    }

    return imageUrl;
  }

  const storageKey = storageKeyFromProviderImageUrl(imageUrl, image.projectId);

  if (storageKey) {
    const object = await loadProviderImage(imageUrl, {
      projectId: image.projectId,
      storage
    });
    return `data:${object.contentType};base64,${object.body.toString("base64")}`;
  }

  throw new Error("Provider image URL must use project storage, data URL, or allowed HTTPS.");
}

function extractOutputText(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("OpenAI scene classification returned an invalid response.");
  }

  const response = raw as Record<string, unknown>;

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const output = response.output;

  if (!Array.isArray(output)) {
    throw new Error("OpenAI scene classification response did not include output.");
  }

  const textParts: string[] = [];
  collectText(output, textParts);

  if (textParts.length === 0) {
    throw new Error("OpenAI scene classification response did not include text.");
  }

  return textParts.join("\n");
}

function collectText(value: unknown, textParts: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, textParts);
    }
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === "string") {
    textParts.push(record.text);
  }

  if (typeof record.value === "string" && record.type === "output_text") {
    textParts.push(record.value);
  }

  for (const child of Object.values(record)) {
    collectText(child, textParts);
  }
}
