import type { WorldAsset } from "@/types";

export type RenderQualityTier = "low" | "balanced";

export interface ClientPerformanceProfile {
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  isMobile: boolean;
  saveData: boolean;
  reducedMotion: boolean;
}

export interface SelectedWorldAsset {
  tier: "100k" | "500k" | "pano" | "stub";
  url: string | null;
  reason: string;
}

const MAX_RENDER_PIXEL_RATIO = 1.5;

export function getRendererPixelRatio(devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio || 1, 1), MAX_RENDER_PIXEL_RATIO);
}

export function getClientPerformanceProfile(): ClientPerformanceProfile {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;

  return {
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency,
    isMobile: window.matchMedia("(max-width: 820px), (pointer: coarse)").matches,
    saveData: connection?.saveData === true,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  };
}

export function chooseRenderQuality(
  profile: ClientPerformanceProfile
): RenderQualityTier {
  if (
    profile.isMobile ||
    profile.saveData ||
    profile.reducedMotion ||
    (profile.hardwareConcurrency !== undefined && profile.hardwareConcurrency <= 4)
  ) {
    return "low";
  }

  return "balanced";
}

export function selectWorldAssetUrl(
  worldAsset: WorldAsset | null,
  profile: ClientPerformanceProfile,
  stubUrl: string | null
): SelectedWorldAsset {
  const quality = chooseRenderQuality(profile);

  if (worldAsset) {
    if (quality === "low" && worldAsset.spzUrl100k) {
      return {
        tier: "100k",
        url: worldAsset.spzUrl100k,
        reason: "mobile or constrained device"
      };
    }

    if (worldAsset.spzUrl500k) {
      return {
        tier: "500k",
        url: worldAsset.spzUrl500k,
        reason: "default capped SPZ tier"
      };
    }

    if (worldAsset.spzUrl100k) {
      return {
        tier: "100k",
        url: worldAsset.spzUrl100k,
        reason: "available capped SPZ tier"
      };
    }

    if (worldAsset.panoUrl || worldAsset.thumbnailUrl) {
      return {
        tier: "pano",
        url: worldAsset.panoUrl ?? worldAsset.thumbnailUrl,
        reason: "full-resolution SPZ omitted for client performance"
      };
    }
  }

  return {
    tier: "stub",
    url: stubUrl,
    reason: "demo fallback asset"
  };
}
