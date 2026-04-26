import { requireOpenAIApiKey } from "@/lib/env";
import { getServerEnv } from "@/lib/env";
import {
  buildPetIdentityAnalysisPrompt,
  type PetTraitExtraction,
  normalizePetProfileFromTraits
} from "@/ai/pet";
import type {
  ImageSeedInput,
  ImageSeedResult,
  OpenAIProvider,
  PetIdentityAnalysisInput,
  PetIdentityAnalysisResult,
  ProviderOptions,
  RealtimeClientSecretInput,
  RealtimeClientSecretResult
} from "./types";

export function createOpenAIProvider(
  options: ProviderOptions = {}
): OpenAIProvider {
  return new OpenAIProviderAdapter(options);
}

class OpenAIProviderAdapter implements OpenAIProvider {
  constructor(private readonly options: ProviderOptions) {}

  async analyzePetIdentity(
    input: PetIdentityAnalysisInput
  ): Promise<PetIdentityAnalysisResult> {
    const raw = await this.postJson<OpenAIResponse>(
      "/responses",
      {
        model: this.options.textModel ?? "gpt-5.4",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "You are the pet identity analyzer for Still With.",
                  "Return valid JSON only.",
                  "Never invent a pet that is not visible in the uploaded images.",
                  "Prefer visual facts over emotional interpretation."
                ].join("\n")
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPetIdentityAnalysisPrompt({
                  imageCount: input.imageUrls.length,
                  clarificationAnswer: input.clarificationAnswer
                })
              },
              ...input.imageUrls.map((imageUrl) =>
                createImageInputContent(imageUrl)
              )
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pet_identity_analysis",
            strict: false,
            schema: PET_IDENTITY_SCHEMA
          }
        }
      },
      input.context?.signal
    );

    const parsed = parseOpenAIJsonOutput(raw);
    const clarificationRequired = Boolean(
      getRecord(parsed).clarificationRequired
    );
    const clarificationPrompt = getString(
      getRecord(parsed).clarificationPrompt
    );
    const traitExtraction = coercePetTraitExtraction(parsed);

    return {
      petProfile: clarificationRequired
        ? null
        : normalizePetProfileFromTraits(
            input.context?.projectId ?? "",
            {
              ...traitExtraction,
              clarificationRequired,
              clarificationAnswer: input.clarificationAnswer ?? null
            }
          ),
      clarificationRequired,
      clarificationPrompt,
      raw
    };
  }

  async generateImageSeed(input: ImageSeedInput): Promise<ImageSeedResult> {
    const raw = input.sourceImageUrls?.length
      ? await this.generateImageEdit(input)
      : await this.postJson<OpenAIImageResponse>(
          "/images/generations",
          {
            model: this.options.imageModel ?? "gpt-image-2",
            prompt: input.prompt,
            n: 1,
            size: input.size ?? "1024x1024",
            quality: input.quality ?? "medium",
            output_format: "png",
            background: "opaque",
            moderation: "auto"
          },
          input.context?.signal
        );
    const imageUrls = raw.data
      .map((image) =>
        image.url ??
        (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null)
      )
      .filter((value): value is string => Boolean(value));

    if (imageUrls.length === 0) {
      throw new Error("OpenAI image generation returned no image data.");
    }

    return { imageUrls, raw };
  }

  private async generateImageEdit(
    input: ImageSeedInput
  ): Promise<OpenAIImageResponse> {
    const form = new FormData();

    form.append("model", this.options.imageModel ?? "gpt-image-2");
    form.append("prompt", input.prompt);
    form.append("n", "1");
    form.append("size", input.size ?? "1024x1024");
    form.append("quality", input.quality ?? "medium");
    form.append("output_format", "png");
    form.append("background", "opaque");
    form.append("moderation", "auto");

    for (const [index, imageUrl] of (input.sourceImageUrls ?? []).entries()) {
      await appendImageReferenceToForm(form, imageUrl, index, input.context?.signal);
    }

    return this.postForm<OpenAIImageResponse>(
      "/images/edits",
      form,
      input.context?.signal
    );
  }

  async createRealtimeClientSecret(
    input: RealtimeClientSecretInput
  ): Promise<RealtimeClientSecretResult> {
    const raw = await this.postJson<OpenAIRealtimeClientSecretResponse>(
      "/realtime/client_secrets",
      {
        session: {
          type: "realtime",
          model: this.options.realtimeModel ?? "gpt-realtime-1.5",
          audio: {
            output: {
              voice: input.voice ?? "alloy"
            }
          }
        }
      },
      input.context?.signal
    );

    const secret = raw.client_secret?.value ?? raw.value;
    const expiresAtSeconds = raw.client_secret?.expires_at ?? raw.expires_at;

    if (!secret) {
      throw new Error("OpenAI Realtime client secret response was missing a secret.");
    }

    return {
      clientSecret: secret,
      expiresAt: expiresAtSeconds
        ? new Date(expiresAtSeconds * 1000).toISOString()
        : new Date(Date.now() + 60_000).toISOString()
    };
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireOpenAIApiKey();
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await fetch(`${this.getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      throw new Error(await buildOpenAIErrorMessage(response));
    }

    return (await response.json()) as T;
  }

  private async postForm<T>(
    path: string,
    body: FormData,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await fetch(`${this.getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`
      },
      body,
      signal
    });

    if (!response.ok) {
      throw new Error(await buildOpenAIErrorMessage(response));
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

interface OpenAIResponse {
  output?: unknown[];
  output_text?: string;
}

interface OpenAIImageResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

interface OpenAIRealtimeClientSecretResponse {
  value?: string;
  expires_at?: number;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
}

const PET_IDENTITY_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    petCandidates: { type: "array" },
    identityClusters: { type: "array" },
    selectedClusterId: { type: ["string", "null"] },
    selectionConfidence: { type: "number" },
    clarificationRequired: { type: "boolean" },
    clarificationPrompt: { type: ["string", "null"] },
    petTraitSummary: {
      type: "object",
      additionalProperties: true,
      properties: {
        sourceCandidateIds: { type: "array", items: { type: "string" } },
        species: { type: ["string", "null"] },
        name: { type: ["string", "null"] },
        traitSummary: { type: ["string", "null"] },
        coatColors: { type: "array", items: { type: "string" } },
        distinctiveMarkings: { type: "array", items: { type: "string" } },
        faceDescription: { type: ["string", "null"] },
        bodyDescription: { type: ["string", "null"] },
        earDescription: { type: ["string", "null"] },
        tailDescription: { type: ["string", "null"] },
        sizeDescription: { type: ["string", "null"] },
        accessories: { type: "array", items: { type: "string" } },
        breedLikeDescription: { type: ["string", "null"] }
      }
    }
  }
} as const;

function createImageInputContent(imageUrl: string): Record<string, string> {
  const publicImageUrl = toPublicImageUrl(imageUrl);

  if (publicImageUrl) {
    return {
      type: "input_image",
      image_url: publicImageUrl
    };
  }

  throw new Error("OpenAI image inputs require a public URL or data URL.");
}

async function appendImageReferenceToForm(
  form: FormData,
  imageUrl: string,
  index: number,
  signal?: AbortSignal
): Promise<void> {
  const dataUrl = parseImageDataUrl(imageUrl);

  if (dataUrl) {
    form.append(
      "image[]",
      new Blob([toArrayBuffer(dataUrl.body)], { type: dataUrl.contentType }),
      `reference-${index}.${extensionForContentType(dataUrl.contentType)}`
    );
    return;
  }

  const publicImageUrl = toPublicImageUrl(imageUrl);
  if (!publicImageUrl) {
    throw new Error("OpenAI image edits require public URLs or data URLs.");
  }

  const response = await fetch(publicImageUrl, { signal });
  if (!response.ok) {
    throw new Error(`Unable to fetch OpenAI image reference ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  form.append(
    "image[]",
    new Blob([await response.arrayBuffer()], { type: contentType }),
    `reference-${index}.${extensionForContentType(contentType)}`
  );
}

function parseImageDataUrl(
  value: string
): { contentType: string; body: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(value);
  if (!match) {
    return null;
  }

  return {
    contentType: match[1],
    body: Buffer.from(match[2], "base64")
  };
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  return "png";
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

function toPublicImageUrl(imageUrl: string): string | null {
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
      "OpenAI image inputs require a public app URL or data URL, not localhost."
    );
  }

  return url;
}

function parseOpenAIJsonOutput(raw: OpenAIResponse): unknown {
  const outputText = raw.output_text ?? findFirstString(raw.output);

  if (!outputText) {
    throw new Error("OpenAI response did not contain parseable text output.");
  }

  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw new Error("OpenAI response did not contain valid JSON.");
  }
}

function coercePetTraitExtraction(parsed: unknown): PetTraitExtraction {
  const record = getRecord(parsed);
  const petTraitSummary = getRecord(record.petTraitSummary);
  const selectedCluster = findSelectedCluster(record);

  return {
    sourceCandidateIds:
      getStringArray(petTraitSummary.sourceCandidateIds) ??
      getStringArray(selectedCluster.sourceCandidateIds) ??
      [],
    species: getString(petTraitSummary.species),
    name: getString(petTraitSummary.name),
    traitSummary: getString(petTraitSummary.traitSummary),
    coatColors: getStringArray(petTraitSummary.coatColors) ?? [],
    distinctiveMarkings:
      getStringArray(petTraitSummary.distinctiveMarkings) ?? [],
    faceDescription: getString(petTraitSummary.faceDescription),
    bodyDescription: getString(petTraitSummary.bodyDescription),
    earDescription: getString(petTraitSummary.earDescription),
    tailDescription: getString(petTraitSummary.tailDescription),
    sizeDescription: getString(petTraitSummary.sizeDescription),
    accessories: getStringArray(petTraitSummary.accessories) ?? [],
    breedLikeDescription: getString(petTraitSummary.breedLikeDescription),
    selectionConfidence: getNumber(record.selectionConfidence)
  };
}

function findSelectedCluster(record: Record<string, unknown>): Record<string, unknown> {
  const selectedClusterId = getString(record.selectedClusterId);
  const clusters = Array.isArray(record.identityClusters)
    ? record.identityClusters
    : [];

  for (const cluster of clusters) {
    const clusterRecord = getRecord(cluster);
    if (getString(clusterRecord.id) === selectedClusterId) {
      return clusterRecord;
    }
  }

  return {};
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
      getString(record.output_text) ??
      getString(record.text) ??
      findFirstString(record.content)
    );
  }

  return null;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is string => typeof item === "string");
}

async function buildOpenAIErrorMessage(response: Response): Promise<string> {
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
    `OpenAI request failed with ${response.status}`,
    requestId ? `request_id=${requestId}` : null,
    detail || null
  ]
    .filter(Boolean)
    .join(" ");
}
