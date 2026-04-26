import {
  REQUIRED_MOTION_KEYS,
  isPetMotionKey,
  type PetMotionKey
} from "@/pet/motion-set";
import type { MotionClip, PetProfile } from "@/types";
import type { StorageDriver } from "@/server/storage";

export interface MotionClipQualityEvaluation {
  score: number;
  passed: boolean;
  issues: string[];
  source: "asset-inspection";
}

export interface EvaluateMotionClipQualityInput {
  clip: MotionClip;
  petProfile: PetProfile;
  storage: StorageDriver;
}

export async function evaluateMotionClipQuality(
  input: EvaluateMotionClipQualityInput
): Promise<MotionClipQualityEvaluation> {
  const issues: string[] = [];
  let score = 0.2;

  if (!isPetMotionKey(input.clip.motionKey)) {
    issues.push("motion key is not part of the required pet motion set");
  } else {
    score += 0.08;
  }

  if (
    input.clip.keyframeImageUrls.length > 0 ||
    input.clip.postprocess?.alphaStrategy === "fallback-still"
  ) {
    const keyframeInspection =
      input.clip.postprocess?.alphaStrategy === "fallback-still" &&
      input.clip.keyframeImageUrls.length === 0
        ? await inspectFallbackPosterAsset(input.clip.processedVideoUrl, input.storage)
        : await inspectAssetUrl(input.clip.keyframeImageUrls[0], input.storage);
    if (
      keyframeInspection.exists &&
      keyframeInspection.isImage
    ) {
      score += 0.15;
    } else {
      issues.push("keyframe or fallback poster asset is not readable");
    }
  } else {
    issues.push("no keyframe image is attached");
  }

  if (input.clip.rawVideoUrl || input.clip.processedVideoUrl) {
    const outputInspection =
      input.clip.postprocess?.alphaStrategy === "fallback-still"
        ? await inspectFallbackAnimationAsset(
            input.clip.processedVideoUrl,
            input.storage
          )
        : await inspectAssetUrl(
            input.clip.processedVideoUrl ?? input.clip.rawVideoUrl,
            input.storage
          );
    if (outputInspection.exists && outputInspection.isRenderable) {
      score += 0.2;
    } else {
      issues.push("processed media asset is not readable or renderable");
    }
  } else {
    issues.push("no video or fallback animation asset is attached");
  }

  if (
    input.clip.postprocess?.alphaStrategy === "fallback-still" ||
    input.clip.postprocess?.alphaStrategy === "shader-chroma-key" ||
    input.clip.alphaVideoUrl
  ) {
    score += 0.12;
  } else {
    issues.push("no alpha strategy or shader fallback contract is available");
  }

  if (input.petProfile.traitSummary.trim()) {
    score += 0.06;
  } else {
    issues.push("pet profile trait summary is empty");
  }

  if (!promptHasSinglePetConstraints(input.clip.prompt)) {
    issues.push("prompt does not explicitly forbid people, other animals, props, and complex backgrounds");
  } else {
    score += 0.1;
  }

  if (input.clip.petProfileId !== input.petProfile.id) {
    score -= 0.3;
    issues.push("clip is not bound to the selected pet profile");
  }

  if (input.clip.status === "failed") {
    score -= 0.4;
    issues.push("clip status is failed");
  }

  return {
    score: roundScore(score),
    passed: score >= 0.76 && issues.length === 0,
    issues,
    source: "asset-inspection"
  };
}

export function missingRequiredMotionKeys(clips: readonly MotionClip[]): PetMotionKey[] {
  const available = new Set(
    clips
      .map((clip) => clip.motionKey)
      .filter((motionKey): motionKey is PetMotionKey => isPetMotionKey(motionKey))
  );

  return REQUIRED_MOTION_KEYS.filter((motionKey) => !available.has(motionKey));
}

function promptHasSinglePetConstraints(prompt: string): boolean {
  const normalized = prompt.toLowerCase();

  return (
    /(one selected pet|exactly one animal|one pet)/.test(normalized) &&
    normalized.includes("no people") &&
    normalized.includes("no other animals") &&
    normalized.includes("no props") &&
    normalized.includes("no complex background")
  );
}

function roundScore(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

async function inspectAssetUrl(
  url: string | null,
  storage: StorageDriver
): Promise<{
  exists: boolean;
  isImage: boolean;
  isRenderable: boolean;
}> {
  if (!url) {
    return { exists: false, isImage: false, isRenderable: false };
  }

  if (url.startsWith("data:image/")) {
    return { exists: true, isImage: true, isRenderable: true };
  }

  const storageKey = parseStorageApiUrl(url);
  if (storageKey) {
    try {
      const object = await storage.getObject(storageKey);
      const isImage = object.contentType.startsWith("image/");
      const isVideo = object.contentType.startsWith("video/");

      return {
        exists: object.size > 0,
        isImage,
        isRenderable: isImage || isVideo
      };
    } catch {
      return { exists: false, isImage: false, isRenderable: false };
    }
  }

  if (/^https?:\/\//.test(url)) {
    return {
      exists: true,
      isImage: /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url),
      isRenderable: true
    };
  }

  return { exists: false, isImage: false, isRenderable: false };
}

async function inspectFallbackAnimationAsset(
  url: string | null,
  storage: StorageDriver
): Promise<{
  exists: boolean;
  isImage: boolean;
  isRenderable: boolean;
}> {
  const manifest = await readFallbackManifest(url, storage);
  if (!manifest) {
    return { exists: false, isImage: false, isRenderable: false };
  }

  const poster = await inspectAssetUrl(manifest.stillImageUrl, storage);
  return {
    exists: poster.exists,
    isImage: false,
    isRenderable: poster.exists && poster.isImage
  };
}

async function inspectFallbackPosterAsset(
  url: string | null,
  storage: StorageDriver
): Promise<{
  exists: boolean;
  isImage: boolean;
  isRenderable: boolean;
}> {
  const manifest = await readFallbackManifest(url, storage);
  if (!manifest) {
    return { exists: false, isImage: false, isRenderable: false };
  }

  return inspectAssetUrl(manifest.stillImageUrl, storage);
}

async function readFallbackManifest(
  url: string | null,
  storage: StorageDriver
): Promise<{ stillImageUrl: string } | null> {
  if (!url) {
    return null;
  }

  const storageKey = parseStorageApiUrl(url);
  if (!storageKey) {
    return null;
  }

  try {
    const object = await storage.getObject(storageKey);
    if (object.contentType !== "application/json") {
      return null;
    }

    const parsed = JSON.parse(object.body.toString("utf8")) as {
      kind?: unknown;
      stillImageUrl?: unknown;
    };

    if (
      parsed.kind !== "fallback-still-animation" ||
      typeof parsed.stillImageUrl !== "string"
    ) {
      return null;
    }

    return { stillImageUrl: parsed.stillImageUrl };
  } catch {
    return null;
  }
}

function parseStorageApiUrl(url: string): string | null {
  if (!url.startsWith("/api/storage/")) {
    return null;
  }

  return url
    .slice("/api/storage/".length)
    .split(/[?#]/, 1)[0]
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}
