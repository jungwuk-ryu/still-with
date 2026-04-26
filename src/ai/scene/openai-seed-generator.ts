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
const DEFAULT_IMAGE_REQUEST_TIMEOUT_MS = 200_000;
const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;

export interface OpenAISceneSeedGeneratorOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  storage?: StorageDriver;
  requestTimeoutMs?: number;
  downloadTimeoutMs?: number;
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
    let response =
      input.sourceImageUrls.length > 0
        ? await this.generateImageEdit(apiKey, input)
        : await this.generateImageFromPrompt(apiKey, input);

    if (!response.ok && input.sourceImageUrls.length > 0) {
      const editError = await readOpenAIImageError(
        response,
        "OpenAI scene seed edit generation"
      );

      if (!shouldFallbackFromEditRejection(editError)) {
        throw new Error(formatOpenAIImageError(editError));
      }

      response = await this.generateImageFromPrompt(apiKey, input);

      if (!response.ok) {
        const fallbackError = await readOpenAIImageError(
          response,
          "OpenAI scene seed prompt generation"
        );
        throw new Error(
          `${formatOpenAIImageError(editError)}; prompt fallback failed: ${formatOpenAIImageError(
            fallbackError
          )}`
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        formatOpenAIImageError(
          await readOpenAIImageError(response, "OpenAI scene seed generation")
        )
      );
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

    const body =
      image.bytes ??
      (await fetchRemoteImage(
        image.url,
        this.fetchImpl,
        this.options.downloadTimeoutMs ?? DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS
      ));
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
    return fetchWithTimeout(
      this.fetchImpl,
      OPENAI_IMAGE_GENERATIONS_URL,
      {
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
      },
      {
        label: "OpenAI scene seed prompt generation",
        timeoutMs: this.options.requestTimeoutMs ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_MS
      }
    );
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
    body.set("output_format", "png");
    body.set("background", "opaque");
    body.set("moderation", "auto");

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
        "image[]",
        new Blob([imageBytes], { type: sourceImage.contentType }),
        sourceImage.filename
      );
    }

    return fetchWithTimeout(
      this.fetchImpl,
      OPENAI_IMAGE_EDITS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body
      },
      {
        label: "OpenAI scene seed edit generation",
        timeoutMs: this.options.requestTimeoutMs ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_MS
      }
    );
  }
}

interface OpenAIImageError {
  label: string;
  status: number;
  requestId: string | null;
  code: string | null;
  message: string | null;
}

async function readOpenAIImageError(
  response: Response,
  label: string
): Promise<OpenAIImageError> {
  const requestId = response.headers.get("x-request-id");
  let code: string | null = null;
  let message: string | null = null;

  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string };
    };
    code = body.error?.code ?? null;
    message = body.error?.message ?? null;
  } catch {
    message = await response.text().catch(() => "");
  }

  return {
    label,
    status: response.status,
    requestId,
    code,
    message
  };
}

function shouldFallbackFromEditRejection(error: OpenAIImageError): boolean {
  if (error.status !== 400) {
    return false;
  }

  const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  const mentionsImageInput = /\b(image|input|reference|photo)\b/.test(detail);
  const mentionsRejection =
    /\b(reject|rejected|moderation|policy|safety|content)\b/.test(detail);
  const mentionsContractFailure =
    /\b(unknown|unsupported|missing|required|parameter|multipart|field)\b/.test(
      detail
    );

  return mentionsImageInput && mentionsRejection && !mentionsContractFailure;
}

function formatOpenAIImageError(error: OpenAIImageError): string {
  const detail = error.code
    ? `${error.code}: ${error.message ?? "request failed"}`
    : error.message;

  return [
    `${error.label} failed with HTTP ${error.status}`,
    error.requestId ? `request_id=${error.requestId}` : null,
    detail || null
  ]
    .filter(Boolean)
    .join(" ");
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
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Buffer> {
  if (!url) {
    throw new Error("OpenAI scene seed generation did not return a fetchable image.");
  }

  const response = await fetchWithTimeout(fetchImpl, url, undefined, {
    label: "OpenAI scene seed image download",
    timeoutMs
  });

  if (!response.ok) {
    throw new Error(`Failed to store generated scene seed image with HTTP ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init:
    | (RequestInit & {
        duplex?: "half";
      })
    | undefined,
  options: { label: string; timeoutMs: number }
): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          `${options.label} timed out after ${formatTimeout(options.timeoutMs)}.`
        )
      );
    }, options.timeoutMs);
  });
  const request = (async () => {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    });
  })();

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function formatTimeout(timeoutMs: number): string {
  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000} seconds`;
  }

  return `${timeoutMs} ms`;
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
