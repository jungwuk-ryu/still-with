import { requireElevenLabsApiKey } from "@/lib/env";
import type {
  ElevenLabsAudioResult,
  ElevenLabsMusicInput,
  ElevenLabsProvider,
  ElevenLabsProviderOptions,
  ElevenLabsSoundEffectInput
} from "./types";

const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const TRANSIENT_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class ElevenLabsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retriable: boolean
  ) {
    super(message);
    this.name = "ElevenLabsHttpError";
  }
}

export function createElevenLabsProvider(
  options: ElevenLabsProviderOptions = {}
): ElevenLabsProvider {
  return new ElevenLabsHttpProvider(options);
}

class ElevenLabsHttpProvider implements ElevenLabsProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly outputFormat: string;

  constructor(private readonly options: ElevenLabsProviderOptions) {
    this.baseUrl = options.apiBaseUrl?.replace(/\/$/, "") ?? ELEVENLABS_API_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.outputFormat = options.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  }

  async composeMusic(input: ElevenLabsMusicInput): Promise<ElevenLabsAudioResult> {
    return this.requestAudio(
      "/v1/music",
      {
        prompt: input.prompt,
        music_length_ms: input.musicLengthMs,
        model_id: input.modelId ?? "music_v1",
        force_instrumental: input.forceInstrumental ?? true
      },
      input.context?.signal
    );
  }

  async createSoundEffect(
    input: ElevenLabsSoundEffectInput
  ): Promise<ElevenLabsAudioResult> {
    return this.requestAudio(
      "/v1/sound-generation",
      {
        text: input.text,
        duration_seconds: input.durationSeconds,
        loop: input.loop,
        prompt_influence: input.promptInfluence,
        model_id: input.modelId ?? "eleven_text_to_sound_v2"
      },
      input.context?.signal
    );
  }

  private async requestAudio(
    endpoint: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ElevenLabsAudioResult> {
    const apiKey = this.options.apiKey ?? requireElevenLabsApiKey();
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set("output_format", this.outputFormat);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey
          },
          body: JSON.stringify(omitUndefined(body)),
          signal
        });

        if (response.ok) {
          return {
            audio: Buffer.from(await response.arrayBuffer()),
            contentType: inferContentType(
              response.headers.get("content-type"),
              this.outputFormat
            ),
            raw: {
              characterCost: response.headers.get("character-cost"),
              songId: response.headers.get("song-id"),
              outputFormat: this.outputFormat
            }
          };
        }

        const retriable = TRANSIENT_STATUS_CODES.has(response.status);
        const message = await buildErrorMessage(response);

        if (!retriable || attempt >= this.maxRetries) {
          throw new ElevenLabsHttpError(message, response.status, retriable);
        }

        await sleep(getRetryDelayMs(attempt, response.headers.get("retry-after")));
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("ElevenLabs request failed.");

        if (
          error instanceof ElevenLabsHttpError &&
          (!error.retriable || attempt >= this.maxRetries)
        ) {
          throw error;
        }

        if (attempt >= this.maxRetries) {
          throw lastError;
        }

        await sleep(getRetryDelayMs(attempt));
      }
    }

    throw lastError ?? new Error("ElevenLabs request failed.");
  }
}

function omitUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function inferContentType(contentType: string | null, outputFormat: string): string {
  if (contentType) {
    return contentType.split(";")[0]?.trim() || "application/octet-stream";
  }

  if (outputFormat.startsWith("mp3")) {
    return "audio/mpeg";
  }

  if (outputFormat.startsWith("opus")) {
    return "audio/ogg";
  }

  if (outputFormat.startsWith("pcm")) {
    return "audio/wav";
  }

  return "application/octet-stream";
}

async function buildErrorMessage(response: Response): Promise<string> {
  let detail = "";

  try {
    const body = (await response.json()) as {
      detail?: { message?: string; status?: string } | string;
      error?: { message?: string; code?: string };
    };
    detail =
      typeof body.detail === "string"
        ? body.detail
        : body.detail?.message ??
          body.detail?.status ??
          body.error?.message ??
          body.error?.code ??
          "";
  } catch {
    detail = await response.text().catch(() => "");
  }

  return [`ElevenLabs request failed with HTTP ${response.status}`, detail || null]
    .filter(Boolean)
    .join(" ");
}

function getRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(30_000, retryAfterSeconds * 1_000);
  }

  return Math.min(8_000, 750 * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
