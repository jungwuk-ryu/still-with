import { createHash } from "node:crypto";
import path from "node:path";
import { requireWorldLabsApiKey } from "@/lib/env";
import {
  assertRemoteProviderImageUrlAllowed,
  loadProviderImage,
  storageKeyFromProviderImageUrl
} from "@/server/providers/image-inputs";
import { createLocalStorageDriver, type StorageDriver } from "@/server/storage";
import { defaultInitialCameraPose } from "@/world";
import type {
  ProviderCallContext,
  ProviderOptions,
  WorldLabsCreateWorldInput,
  WorldLabsOperation,
  WorldLabsProvider
} from "./types";
import type { WorldAsset } from "@/types";

const WORLDLABS_API_BASE_URL = "https://api.worldlabs.ai";
const DEFAULT_WORLDLABS_MODEL = "marble-1.1";
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface WorldLabsProviderOptions extends ProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  storage?: StorageDriver;
  model?: string;
  maxRetries?: number;
}

export class WorldLabsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retriable: boolean
  ) {
    super(message);
    this.name = "WorldLabsHttpError";
  }
}

export function createWorldLabsProvider(
  options: WorldLabsProviderOptions = {}
): WorldLabsProvider {
  return new WorldLabsHttpProvider(options);
}

class WorldLabsHttpProvider implements WorldLabsProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly storage: StorageDriver;
  private readonly maxRetries: number;

  constructor(private readonly options: WorldLabsProviderOptions) {
    this.baseUrl = options.baseUrl ?? WORLDLABS_API_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.storage = options.storage ?? createLocalStorageDriver();
    this.maxRetries = options.maxRetries ?? 2;
  }

  async createWorld(input: WorldLabsCreateWorldInput): Promise<WorldLabsOperation> {
    const worldPrompt = await this.buildWorldPrompt(input);
    const body = {
      display_name: (input.displayName ?? input.sceneCluster.label).slice(0, 64),
      model: input.model ?? this.options.model ?? DEFAULT_WORLDLABS_MODEL,
      permission: {
        public: false,
        allow_id_access: false,
        allowed_readers: [],
        allowed_writers: []
      },
      world_prompt: worldPrompt
    };
    const raw = await this.requestJson("/marble/v1/worlds:generate", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Idempotency-Key": input.idempotencyKey ?? createWorldIdempotencyKey(input, body)
      },
      signal: input.context?.signal
    });

    return mapOperation(raw);
  }

  async getOperation(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<WorldLabsOperation> {
    const raw = await this.requestJson(
      `/marble/v1/operations/${encodeURIComponent(operationId)}`,
      {
        method: "GET",
        signal: context?.signal
      }
    );

    return mapOperation(raw);
  }

  async getWorldAssets(
    worldId: string,
    context?: ProviderCallContext
  ): Promise<WorldAsset> {
    const raw = await this.requestJson(
      `/marble/v1/worlds/${encodeURIComponent(worldId)}`,
      {
        method: "GET",
        signal: context?.signal
      }
    );
    const world = extractWorld(raw);
    return mapWorldAsset(world, {
      projectId: context?.projectId ?? "",
      sceneClusterId: context?.sceneClusterId ?? "",
      worldId
    });
  }

  private async buildWorldPrompt(
    input: WorldLabsCreateWorldInput
  ): Promise<Record<string, unknown>> {
    const seedImages = normalizeSeedImages(input);
    const textPrompt = input.textPrompt ?? input.sceneCluster.spatialPrompt ?? undefined;
    const inputMode = input.inputMode ?? inferInputMode(seedImages);

    if (inputMode === "panorama") {
      const seed = seedImages[0];

      if (!seed) {
        throw new Error("World Labs panorama generation requires one seed image.");
      }

      return {
        type: "image",
        image_prompt: await this.toWorldLabsContent(seed.url, input.sceneCluster.projectId),
        is_pano: true,
        text_prompt: textPrompt
      };
    }

    if (inputMode === "single-image") {
      const seed = seedImages[0];

      if (!seed) {
        throw new Error("World Labs image generation requires one seed image.");
      }

      return {
        type: "image",
        image_prompt: await this.toWorldLabsContent(seed.url, input.sceneCluster.projectId),
        is_pano: false,
        text_prompt: textPrompt
      };
    }

    const multiImagePrompt = await Promise.all(
      seedImages.slice(0, 4).map(async (seed, index) => ({
        azimuth: seed.azimuth ?? azimuthForIndex(index),
        content: await this.toWorldLabsContent(seed.url, input.sceneCluster.projectId)
      }))
    );

    if (multiImagePrompt.length < 2) {
      throw new Error("World Labs multi-image generation requires at least two seed images.");
    }

    return {
      type: "multi-image",
      multi_image_prompt: multiImagePrompt,
      text_prompt: textPrompt
    };
  }

  private async toWorldLabsContent(
    sourceUrl: string,
    projectId: string
  ): Promise<Record<string, string>> {
    if (/^https?:\/\//.test(sourceUrl)) {
      await assertRemoteProviderImageUrlAllowed(sourceUrl);
      return {
        source: "uri",
        uri: sourceUrl
      };
    }

    if (sourceUrl.startsWith("data:")) {
      const parsed = parseDataUrl(sourceUrl);
      return {
        source: "data_base64",
        data_base64: parsed.base64,
        extension: parsed.extension
      };
    }

    const storageKey = storageKeyFromProviderImageUrl(sourceUrl, projectId);

    if (!storageKey) {
      throw new Error("World Labs local seed image URL is not backed by storage.");
    }

    const object = await loadProviderImage(sourceUrl, {
      projectId,
      storage: this.storage,
      fetchImpl: this.fetchImpl
    });
    return {
      source: "data_base64",
      data_base64: object.body.toString("base64"),
      extension: extensionFromStorageKey(storageKey)
    };
  }

  private async requestJson(
    endpoint: string,
    init: RequestInit,
    maxRetries = this.maxRetries
  ): Promise<unknown> {
    const apiKey = this.options.apiKey ?? requireWorldLabsApiKey();
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            "WLT-Api-Key": apiKey,
            ...init.headers
          }
        });

        if (response.ok) {
          return (await response.json()) as unknown;
        }

        const retriable = TRANSIENT_STATUS_CODES.has(response.status);
        const message = `World Labs request failed with HTTP ${response.status}.`;

        if (!retriable || attempt >= maxRetries) {
          throw new WorldLabsHttpError(message, response.status, retriable);
        }

        await sleep(getRetryDelayMs(attempt, response.headers.get("retry-after")));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("World Labs request failed.");

        if (
          error instanceof WorldLabsHttpError &&
          (!error.retriable || attempt >= maxRetries)
        ) {
          throw error;
        }

        if (attempt >= maxRetries) {
          throw lastError;
        }

        await sleep(getRetryDelayMs(attempt));
      }
    }

    throw lastError ?? new Error("World Labs request failed.");
  }
}

function normalizeSeedImages(input: WorldLabsCreateWorldInput): Array<{
  url: string;
  view?: "front" | "left" | "right" | "back" | "panorama";
  azimuth?: number | null;
}> {
  if (input.seedImages && input.seedImages.length > 0) {
    return input.seedImages;
  }

  return input.seedImageUrls.map((url, index) => ({
    url,
    azimuth: azimuthForIndex(index)
  }));
}

function inferInputMode(
  seedImages: Array<{ view?: string; url: string }>
): "multi-image" | "panorama" | "single-image" {
  if (seedImages.length === 1 && seedImages[0]?.view === "panorama") {
    return "panorama";
  }

  return seedImages.length > 1 ? "multi-image" : "single-image";
}

function mapOperation(raw: unknown): WorldLabsOperation {
  const record = asRecord(raw);
  const error = record.error;
  const done = record.done === true;
  const worldId =
    getString(asRecord(record.metadata), "world_id") ??
    getString(asRecord(record.response), "world_id") ??
    getString(asRecord(record.response), "id");

  return {
    operationId: getString(record, "operation_id") ?? "",
    status: error ? "failed" : done ? "succeeded" : "running",
    worldId,
    raw
  };
}

function extractWorld(raw: unknown): Record<string, unknown> {
  const record = asRecord(raw);
  const nestedWorld = asRecord(record.world);
  return Object.keys(nestedWorld).length > 0 ? nestedWorld : record;
}

function mapWorldAsset(
  world: Record<string, unknown>,
  context: { projectId: string; sceneClusterId: string; worldId: string }
): WorldAsset {
  const worldId = getString(world, "world_id") ?? getString(world, "id") ?? context.worldId;
  const assets = asRecord(world.assets);
  const splats = asRecord(assets.splats);
  const spzUrls = asRecord(splats.spz_urls);
  const mesh = asRecord(assets.mesh);
  const imagery = asRecord(assets.imagery);
  const semantics = asRecord(splats.semantics_metadata);

  return {
    id: `world-asset-${worldId}`,
    projectId: context.projectId,
    sceneClusterId: context.sceneClusterId,
    worldId,
    spzUrl100k: getString(spzUrls, "100k"),
    spzUrl500k: getString(spzUrls, "500k"),
    spzUrlFullRes: getString(spzUrls, "full_res"),
    colliderMeshUrl: getString(mesh, "collider_mesh_url"),
    panoUrl: getString(imagery, "pano_url"),
    thumbnailUrl: getString(assets, "thumbnail_url"),
    groundPlaneOffset: getNumber(semantics, "ground_plane_offset") ?? 0,
    initialCameraPose: defaultInitialCameraPose()
  };
}

function parseDataUrl(dataUrl: string): { base64: string; extension: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);

  if (!match) {
    throw new Error("World Labs data URL seed image is invalid.");
  }

  return {
    base64: match[2],
    extension: extensionFromContentType(match[1])
  };
}

function extensionFromStorageKey(key: string): string {
  const extension = path.extname(key).slice(1).toLowerCase();
  return extension || "png";
}

function extensionFromContentType(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

function azimuthForIndex(index: number): number {
  return [0, 90, 180, 270][index % 4] ?? 0;
}

function createWorldIdempotencyKey(
  input: WorldLabsCreateWorldInput,
  body: Record<string, unknown>
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sceneClusterId: input.sceneCluster.id,
        projectId: input.sceneCluster.projectId,
        body
      })
    )
    .digest("hex");
}

function getRetryDelayMs(attempt: number, retryAfter: string | null = null): number {
  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;

  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1_000;
  }

  const baseDelay = Math.min(10_000, 500 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay + jitter;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
