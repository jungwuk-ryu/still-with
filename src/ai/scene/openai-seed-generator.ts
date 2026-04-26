import path from "node:path";
import { requireOpenAIApiKey } from "@/lib/env";
import { loadProviderImage } from "@/server/providers/image-inputs";
import { createLocalStorageDriver } from "@/server/storage";
import type { StorageDriver } from "@/server/storage";
import type {
  GeneratedSeedImage,
  SceneSeedGenerator,
  SceneSeedGeneratorInput
} from "./types";

const OPENAI_IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

export interface OpenAISceneSeedGeneratorOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  storage?: StorageDriver;
}

export class OpenAISceneSeedGenerator implements SceneSeedGenerator {
  private readonly fetchImpl: typeof fetch;
  private readonly storage: StorageDriver;

  constructor(private readonly options: OpenAISceneSeedGeneratorOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.storage = options.storage ?? createLocalStorageDriver();
  }

  async generateSeed(
    input: SceneSeedGeneratorInput
  ): Promise<GeneratedSeedImage> {
    const apiKey = this.options.apiKey ?? requireOpenAIApiKey();
    const response =
      input.sourceImageUrls.length > 0
        ? await this.generateImageEdit(apiKey, input)
        : await this.generateImageFromPrompt(apiKey, input);

    if (!response.ok) {
      throw new Error(`OpenAI scene seed generation failed with HTTP ${response.status}.`);
    }

    const raw = (await response.json()) as unknown;
    const image = extractImagePayload(raw);
    const extension = image.extension ?? "png";
    const key = path.posix.join(
      "projects",
      input.projectId,
      "space-seeds",
      input.sceneClusterId,
      `${input.view}.${extension}`
    );

    const body = image.bytes ?? (await fetchRemoteImage(image.url, this.fetchImpl));
    const stored = await putGeneratedSeedImage(this.storage, {
      key,
      body,
      contentType: contentTypeForExtension(extension)
    });

    return {
      view: input.view,
      azimuth: input.view === "panorama" ? null : azimuthForView(input.view),
      url: stored.url,
      prompt: input.prompt
    };
  }

  private async generateImageFromPrompt(
    apiKey: string,
    input: SceneSeedGeneratorInput
  ): Promise<Response> {
    return this.fetchImpl(OPENAI_IMAGE_GENERATIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
        prompt: input.prompt,
        n: 1,
        size: input.view === "panorama" ? "2048x1024" : "1536x1024",
        quality: "high",
        background: "opaque"
      })
    });
  }

  private async generateImageEdit(
    apiKey: string,
    input: SceneSeedGeneratorInput
  ): Promise<Response> {
    const body = new FormData();
    body.set("model", this.options.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL);
    body.set("prompt", input.prompt);
    body.set("n", "1");
    body.set("size", input.view === "panorama" ? "2048x1024" : "1536x1024");
    body.set("quality", "high");
    body.set("background", "opaque");

    for (const sourceImageUrl of input.sourceImageUrls.slice(0, 4)) {
      const sourceImage = await loadProviderImage(sourceImageUrl, {
        projectId: input.projectId,
        storage: this.storage,
        fetchImpl: this.fetchImpl
      });
      const imageBytes = sourceImage.body.buffer.slice(
        sourceImage.body.byteOffset,
        sourceImage.body.byteOffset + sourceImage.body.byteLength
      ) as ArrayBuffer;
      body.append(
        "image",
        new Blob([imageBytes], { type: sourceImage.contentType }),
        sourceImage.filename
      );
    }

    return this.fetchImpl(OPENAI_IMAGE_EDITS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body
    });
  }
}

async function putGeneratedSeedImage(
  storage: StorageDriver,
  input: {
    key: string;
    body: Buffer;
    contentType: string;
  }
): Promise<{ url: string }> {
  try {
    return await storage.putObject(input);
  } catch {
    throw new Error("Generated scene seed image could not be stored.");
  }
}

function extractImagePayload(raw: unknown): {
  bytes?: Buffer;
  url?: string;
  extension?: string;
} {
  const response = raw as { data?: Array<Record<string, unknown>> };
  const first = response.data?.[0];

  if (!first) {
    throw new Error("OpenAI scene seed generation did not return image data.");
  }

  if (typeof first.b64_json === "string") {
    return {
      bytes: Buffer.from(first.b64_json, "base64"),
      extension: "png"
    };
  }

  if (typeof first.url === "string") {
    return {
      url: first.url,
      extension: extensionFromUrl(first.url) ?? "png"
    };
  }

  throw new Error("OpenAI scene seed generation returned an unsupported image payload.");
}

async function fetchRemoteImage(
  url: string | undefined,
  fetchImpl: typeof fetch
): Promise<Buffer> {
  if (!url) {
    throw new Error("OpenAI scene seed generation did not return a fetchable image.");
  }

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Failed to store generated scene seed image with HTTP ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function azimuthForView(view: SceneSeedGeneratorInput["view"]): number | null {
  switch (view) {
    case "front":
      return 0;
    case "left":
      return 270;
    case "right":
      return 90;
    case "back":
      return 180;
    case "panorama":
      return null;
  }
}

function extensionFromUrl(url: string): string | null {
  const extension = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return extension || null;
}

function contentTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}
