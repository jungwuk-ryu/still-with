import { requireGeminiApiKey } from "@/lib/env";
import type {
  ProviderCallContext,
  ProviderOptions,
  SoraMotionInput,
  SoraOperation,
  VeoProvider
} from "./types";

export function createVeoProvider(options: ProviderOptions = {}): VeoProvider {
  return new VeoProviderAdapter(options);
}

const DEFAULT_VEO_VIDEO_RESOLUTION = "1080p";

class VeoProviderAdapter implements VeoProvider {
  readonly providerName = "veo" as const;

  constructor(private readonly options: ProviderOptions) {}

  async createMotionClip(input: SoraMotionInput): Promise<SoraOperation> {
    const resolution = resolveVeoResolution();
    const instance: Record<string, unknown> = {
      prompt: input.prompt
    };
    const image = await toVeoImage(input.keyframeImageUrls[0], input.context);

    if (image) {
      instance.image = image;
    }

    const raw = await this.requestJson<VeoOperationResponse>(
      `/models/${this.getModel()}:predictLongRunning`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instances: [instance],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: chooseVeoDurationSeconds(
              input.motionKey,
              resolution
            ),
            resolution
          }
        }),
        signal: input.context?.signal
      }
    );

    return mapVeoOperation(raw);
  }

  async getMotionClip(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<SoraOperation> {
    const raw = await this.requestJson<VeoOperationResponse>(
      assertVeoOperationName(operationId),
      {
        method: "GET",
        signal: context?.signal
      }
    );

    return mapVeoOperation(raw);
  }

  async downloadMotionClipContent(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<Buffer> {
    const raw = await this.requestJson<VeoOperationResponse>(
      assertVeoOperationName(operationId),
      {
        method: "GET",
        signal: context?.signal
      }
    );
    const uri =
      raw.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

    if (!uri) {
      throw new Error("Veo operation did not return a downloadable video URI.");
    }

    const response = await fetchVeoDownload(uri, this.requireApiKey(), context);

    if (!response.ok) {
      throw new Error(await buildVeoErrorMessage(response));
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private getModel(): string {
    return this.options.veoModel ?? "veo-3.1-generate-preview";
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireGeminiApiKey();
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> }
  ): Promise<T> {
    const response = await fetch(this.toUrl(path), {
      ...init,
      headers: {
        "x-goog-api-key": this.requireApiKey(),
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new Error(await buildVeoErrorMessage(response));
    }

    return (await response.json()) as T;
  }

  private toUrl(path: string): string {
    if (/^https?:\/\//.test(path)) {
      throw new Error("Veo operation paths must be relative Google API paths.");
    }

    return `${this.getApiBaseUrl()}/${path.replace(/^\/+/, "")}`;
  }

  private getApiBaseUrl(): string {
    return (
      this.options.apiBaseUrl?.replace(/\/$/, "") ??
      "https://generativelanguage.googleapis.com/v1beta"
    );
  }
}

interface VeoOperationResponse {
  name: string;
  done?: boolean;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string;
          mimeType?: string;
        };
      }>;
    };
  };
}

interface VeoImage {
  bytesBase64Encoded: string;
  mimeType: string;
}

async function toVeoImage(
  imageUrl: string | undefined,
  context?: ProviderCallContext
): Promise<VeoImage | null> {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.startsWith("data:image/")) {
    return parseImageDataUrl(imageUrl);
  }

  if (/^https?:\/\//.test(imageUrl)) {
    const response = await fetch(imageUrl, { signal: context?.signal });
    if (!response.ok) {
      throw new Error(`Veo image reference fetch failed with ${response.status}`);
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0];
    if (!mimeType?.startsWith("image/")) {
      throw new Error("Veo image reference must resolve to an image content type.");
    }

    return {
      bytesBase64Encoded: Buffer.from(await response.arrayBuffer()).toString(
        "base64"
      ),
      mimeType
    };
  }

  return null;
}

function parseImageDataUrl(imageUrl: string): VeoImage {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(imageUrl);

  if (!match) {
    throw new Error("Veo image reference must be a base64 image data URL.");
  }

  return {
    mimeType: match[1],
    bytesBase64Encoded: match[2]
  };
}

function mapVeoOperation(raw: VeoOperationResponse): SoraOperation {
  return {
    operationId: assertVeoOperationName(raw.name),
    status: mapVeoStatus(raw),
    motionClip: null,
    raw
  };
}

function mapVeoStatus(raw: VeoOperationResponse): SoraOperation["status"] {
  if (raw.error) {
    return "failed";
  }

  if (raw.done) {
    return "succeeded";
  }

  return "running";
}

function chooseVeoDurationSeconds(motionKey: string, resolution: string): 4 | 8 {
  if (requiresEightSecondVeoDuration(resolution)) {
    return 8;
  }

  return motionKey === "turn_360" || motionKey === "walk_small" ? 8 : 4;
}

function requiresEightSecondVeoDuration(resolution: string): boolean {
  const normalizedResolution = resolution.toLowerCase();

  return normalizedResolution === "1080p" || normalizedResolution === "4k";
}

function resolveVeoResolution(): string {
  return process.env.VEO_VIDEO_RESOLUTION?.trim() || DEFAULT_VEO_VIDEO_RESOLUTION;
}

function assertVeoOperationName(operationName: string): string {
  if (!/^models\/[^/?#]+\/operations\/[^/?#]+$/.test(operationName)) {
    throw new Error("Veo operation name is invalid.");
  }

  return operationName;
}

async function fetchVeoDownload(
  uri: string,
  apiKey: string,
  context?: ProviderCallContext
): Promise<Response> {
  let url = assertAllowedVeoDownloadUrl(uri);

  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(url.toString(), {
      headers: {
        "x-goog-api-key": apiKey
      },
      redirect: "manual",
      signal: context?.signal
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    url = assertAllowedVeoDownloadUrl(new URL(location, url).toString());
  }

  throw new Error("Veo video download exceeded redirect limit.");
}

function assertAllowedVeoDownloadUrl(uri: string): URL {
  const parsed = new URL(uri);

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "generativelanguage.googleapis.com"
  ) {
    throw new Error("Veo video download URI is not an allowed Google API host.");
  }

  return parsed;
}

async function buildVeoErrorMessage(response: Response): Promise<string> {
  let detail = "";

  try {
    const body = (await response.json()) as {
      error?: { message?: string; status?: string; code?: number };
    };
    detail = body.error?.status
      ? `${body.error.status}: ${body.error.message ?? "request failed"}`
      : body.error?.message ?? "";
  } catch {
    detail = await response.text().catch(() => "");
  }

  return [`Veo request failed with ${response.status}`, detail || null]
    .filter(Boolean)
    .join(" ");
}
