import type { UploadedImage } from "@/types";
import type { ClassifiedSceneCluster, SceneClassificationResult } from "./types";

const CLASSIFICATION_SCHEMA_NOTE = `Return strict JSON with this shape:
{
  "primaryCluster": {
    "label": "short place label",
    "sourceImageIds": ["image-id"],
    "representativeImageIds": ["image-id"],
    "directWorldInputImageIds": ["image-id"],
    "spatialPrompt": "detailed scene-only prompt",
    "visualEvidence": ["floor type", "window placement"],
    "seedStrategy": "direct-multi-image" | "generated-multiview" | "generated-panorama",
    "confidence": 0.0
  },
  "clusters": []
}`;

export function buildSceneClassificationPrompt(images: UploadedImage[]): string {
  const imageLines = images
    .map(
      (image, index) =>
        `${index + 1}. id=${image.id}, order=${image.uploadOrder}, mime=${image.mimeType}, size=${image.width ?? "unknown"}x${image.height ?? "unknown"}`
    )
    .join("\n");

  return [
    "Classify these uploaded pet-memory photos by physical place and choose one primary memory space for a 3D reconstruction MVP.",
    "Prefer the place with the strongest repeated visual evidence and enough room-scale cues.",
    "Choose a concise place label such as Living room, Bedroom, Hallway, Favorite corner, or Apartment playground.",
    "Select representativeImageIds that best show spatial layout, floor, wall, windows, furniture, and lighting.",
    "Only put image IDs in directWorldInputImageIds when the image can safely be used directly for world generation without visible pets, people, or other animals.",
    "If most useful photos include pets, people, or other animals, use generated-multiview so a clean empty seed can be made.",
    "Never include the pet, people, or any other animals in spatialPrompt. Mention that the space is empty and has clear floor area.",
    "Use generated-panorama only when a single panorama seed is more stable than four directional views.",
    CLASSIFICATION_SCHEMA_NOTE,
    "Images:",
    imageLines
  ].join("\n");
}

export function normalizeSceneClassificationResult(
  projectId: string,
  images: UploadedImage[],
  raw: unknown
): SceneClassificationResult {
  const parsed = parseObject(raw);
  const primaryRaw = parseObject(parsed.primaryCluster) ?? {};
  const clustersRaw = Array.isArray(parsed.clusters) ? parsed.clusters : [primaryRaw];

  const primaryCluster = normalizeCluster(primaryRaw, images);
  const clusters = clustersRaw
    .map((cluster) => normalizeCluster(parseObject(cluster) ?? {}, images))
    .filter((cluster) => cluster.sourceImageIds.length > 0);

  return {
    projectId,
    primaryCluster,
    clusters: clusters.length > 0 ? clusters : [primaryCluster],
    raw
  };
}

export function createFallbackSceneClassification(
  projectId: string,
  images: UploadedImage[],
  raw: unknown = null
): SceneClassificationResult {
  const sortedImages = [...images].sort((a, b) => a.uploadOrder - b.uploadOrder);
  const sourceImageIds = sortedImages.map((image) => image.id);
  const representativeImageIds = sortedImages.slice(0, 4).map((image) => image.id);
  const primaryCluster: ClassifiedSceneCluster = {
    label: "Favorite corner",
    sourceImageIds,
    representativeImageIds,
    directWorldInputImageIds: [],
    spatialPrompt:
      "A calm, familiar memory space based on the uploaded photos, preserving the visible floor materials, wall colors, furniture layout, window placement, and gentle natural light. The room is empty of pets, people, and all other animals.",
    visualEvidence: ["uploaded photo layout", "visible floor area", "ambient indoor light"],
    seedStrategy: "generated-multiview",
    confidence: 0.35
  };

  return {
    projectId,
    primaryCluster,
    clusters: [primaryCluster],
    raw
  };
}

export function parseJsonObjectFromText(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("Scene classification response did not contain JSON.");
    }

    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function normalizeCluster(
  raw: Record<string, unknown>,
  images: UploadedImage[]
): ClassifiedSceneCluster {
  const validImageIds = new Set(images.map((image) => image.id));
  const sourceImageIds = normalizeImageIds(raw.sourceImageIds, validImageIds);
  const representativeImageIds = normalizeImageIds(
    raw.representativeImageIds,
    validImageIds
  );
  const directWorldInputImageIds = normalizeImageIds(
    raw.directWorldInputImageIds,
    validImageIds
  );

  return {
    label: normalizeShortString(raw.label, "Favorite corner"),
    sourceImageIds: sourceImageIds.length > 0 ? sourceImageIds : [...validImageIds],
    representativeImageIds:
      representativeImageIds.length > 0
        ? representativeImageIds.slice(0, 4)
        : [...validImageIds].slice(0, 4),
    directWorldInputImageIds: directWorldInputImageIds.slice(0, 4),
    spatialPrompt: normalizeShortString(
      raw.spatialPrompt,
      "A calm, familiar memory space reconstructed from the uploaded photos. The space is empty of pets, people, and all other animals."
    ),
    visualEvidence: normalizeStringArray(raw.visualEvidence).slice(0, 8),
    seedStrategy: normalizeSeedStrategy(raw.seedStrategy, directWorldInputImageIds),
    confidence: normalizeConfidence(raw.confidence)
  };
}

function normalizeSeedStrategy(
  value: unknown,
  directWorldInputImageIds: string[]
): ClassifiedSceneCluster["seedStrategy"] {
  if (
    value === "direct-multi-image" ||
    value === "generated-multiview" ||
    value === "generated-panorama"
  ) {
    return value;
  }

  return directWorldInputImageIds.length >= 2
    ? "direct-multi-image"
    : "generated-multiview";
}

function normalizeImageIds(value: unknown, validImageIds: Set<string>): string[] {
  return normalizeStringArray(value).filter((imageId) => validImageIds.has(imageId));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeShortString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function parseObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
