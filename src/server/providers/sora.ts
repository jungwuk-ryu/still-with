import { requireOpenAIApiKey } from "@/lib/env";
import { getServerEnv } from "@/lib/env";
import type {
  ProviderCallContext,
  ProviderOptions,
  SoraMotionInput,
  SoraOperation,
  SoraProvider
} from "./types";

export function createSoraProvider(options: ProviderOptions = {}): SoraProvider {
  return new SoraProviderAdapter(options);
}

class SoraProviderAdapter implements SoraProvider {
  constructor(private readonly options: ProviderOptions) {}

  async createMotionClip(input: SoraMotionInput): Promise<SoraOperation> {
    const body: Record<string, unknown> = {
      model: this.options.soraModel ?? "sora-2",
      prompt: input.prompt,
      size: "1280x720",
      seconds: chooseSoraSeconds(input.motionKey)
    };

    const inputReference = toPublicImageUrl(input.keyframeImageUrls[0]);
    if (inputReference) {
      body.input_reference = { image_url: inputReference };
    }

    const raw = await this.requestJson<OpenAIVideoResponse>(
      "/videos",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: input.context?.signal
      }
    );

    return mapVideoResponse(raw);
  }

  async getMotionClip(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<SoraOperation> {
    const raw = await this.requestJson<OpenAIVideoResponse>(
      `/videos/${encodeURIComponent(operationId)}`,
      {
        method: "GET",
        signal: context?.signal
      }
    );

    return mapVideoResponse(raw);
  }

  async downloadMotionClipContent(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<Buffer> {
    const response = await fetch(
      `${this.getApiBaseUrl()}/videos/${encodeURIComponent(operationId)}/content?variant=video`,
      {
        headers: {
          Authorization: `Bearer ${this.requireApiKey()}`
        },
        signal: context?.signal
      }
    );

    if (!response.ok) {
      throw new Error(await buildSoraErrorMessage(response));
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireOpenAIApiKey();
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> }
  ): Promise<T> {
    const response = await fetch(`${this.getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new Error(await buildSoraErrorMessage(response));
    }

    return (await response.json()) as T;
  }

  private getApiBaseUrl(): string {
    return (
      this.options.apiBaseUrl?.replace(/\/$/, "") ??
      "https://api.openai.com/v1"
    );
  }
}

interface OpenAIVideoResponse {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  error?: {
    code?: string;
    message?: string;
  };
}

function mapVideoResponse(raw: OpenAIVideoResponse): SoraOperation {
  return {
    operationId: raw.id,
    status: mapSoraStatus(raw.status),
    motionClip: null,
    raw
  };
}

function mapSoraStatus(status: OpenAIVideoResponse["status"]): SoraOperation["status"] {
  switch (status) {
    case "completed":
      return "succeeded";
    case "in_progress":
      return "running";
    default:
      return status;
  }
}

function chooseSoraSeconds(motionKey: string): "4" | "8" | "12" {
  return motionKey === "turn_360" || motionKey === "walk_small" ? "8" : "4";
}

function toPublicImageUrl(imageUrl: string | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  if (/^(https?:|data:image\/)/.test(imageUrl)) {
    if (imageUrl.startsWith("data:image/")) {
      return imageUrl;
    }
    return assertPublicUrl(imageUrl);
  }

  if (imageUrl.startsWith("/")) {
    return assertPublicUrl(new URL(imageUrl, getServerEnv().appUrl).toString());
  }

  return null;
}

function assertPublicUrl(url: string): string {
  const parsed = new URL(url);
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "0.0.0.0"
  ) {
    throw new Error(
      "Sora image references require a public app URL or data URL, not localhost."
    );
  }

  return url;
}

async function buildSoraErrorMessage(response: Response): Promise<string> {
  const requestId = response.headers.get("x-request-id");
  let detail = "";

  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string };
    };
    detail = body.error?.code
      ? `${body.error.code}: ${body.error.message ?? "request failed"}`
      : body.error?.message ?? "";
  } catch {
    detail = await response.text().catch(() => "");
  }

  return [
    `Sora request failed with ${response.status}`,
    requestId ? `request_id=${requestId}` : null,
    detail || null
  ]
    .filter(Boolean)
    .join(" ");
}
