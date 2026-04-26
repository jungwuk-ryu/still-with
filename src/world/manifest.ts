import type { CameraPose, WorldAsset } from "@/types";

export type WorldAssetRenderMode = "spz" | "panorama" | "thumbnail";
export type WorldAssetFallbackKind = "none" | "panorama" | "thumbnail";

export interface WorldAssetManifest {
  schemaVersion: 1;
  id: string;
  projectId: string;
  sceneClusterId: string;
  worldId: string;
  renderMode: WorldAssetRenderMode;
  spz: {
    preferredTier: "500k" | "100k" | "full_res" | null;
    tiers: {
      "100k": string | null;
      "500k": string | null;
      full_res: string | null;
    };
  };
  collider: {
    meshUrl: string | null;
    format: "glb" | null;
  };
  panorama: {
    url: string | null;
  };
  thumbnail: {
    url: string | null;
  };
  fallback: {
    kind: WorldAssetFallbackKind;
    reason: string | null;
  };
  groundPlaneOffset: number;
  initialCameraPose: CameraPose;
  source: {
    provider: "worldlabs";
    generatedAt: string;
  };
}

export function buildWorldAssetManifest(
  asset: WorldAsset,
  generatedAt = new Date().toISOString()
): WorldAssetManifest {
  const preferredTier = getPreferredTier(asset);
  const renderMode: WorldAssetRenderMode = preferredTier
    ? "spz"
    : asset.panoUrl
      ? "panorama"
      : "thumbnail";
  const fallback = getFallback(asset, preferredTier);

  return {
    schemaVersion: 1,
    id: asset.id,
    projectId: asset.projectId,
    sceneClusterId: asset.sceneClusterId,
    worldId: asset.worldId,
    renderMode,
    spz: {
      preferredTier,
      tiers: {
        "100k": asset.spzUrl100k,
        "500k": asset.spzUrl500k,
        full_res: asset.spzUrlFullRes
      }
    },
    collider: {
      meshUrl: asset.colliderMeshUrl,
      format: asset.colliderMeshUrl ? "glb" : null
    },
    panorama: {
      url: asset.panoUrl
    },
    thumbnail: {
      url: asset.thumbnailUrl
    },
    fallback,
    groundPlaneOffset: asset.groundPlaneOffset,
    initialCameraPose: asset.initialCameraPose ?? defaultInitialCameraPose(),
    source: {
      provider: "worldlabs",
      generatedAt
    }
  };
}

export function defaultInitialCameraPose(): CameraPose {
  return {
    position: [0, 1.45, 3],
    target: [0, 1.2, 0],
    fov: 52
  };
}

function getPreferredTier(
  asset: WorldAsset
): WorldAssetManifest["spz"]["preferredTier"] {
  if (!asset.colliderMeshUrl) {
    return null;
  }

  if (asset.spzUrl500k) {
    return "500k";
  }

  if (asset.spzUrl100k) {
    return "100k";
  }

  if (asset.spzUrlFullRes) {
    return "full_res";
  }

  return null;
}

function getFallback(
  asset: WorldAsset,
  preferredTier: WorldAssetManifest["spz"]["preferredTier"]
): WorldAssetManifest["fallback"] {
  if (preferredTier) {
    return {
      kind: "none",
      reason: null
    };
  }

  const hasSpz = Boolean(asset.spzUrl100k || asset.spzUrl500k || asset.spzUrlFullRes);
  const reason = hasSpz
    ? "World Labs did not return a complete SPZ and collider asset."
    : "World Labs did not return a usable SPZ tier.";

  if (asset.panoUrl) {
    return {
      kind: "panorama",
      reason
    };
  }

  return {
    kind: "thumbnail",
    reason: hasSpz
      ? "World Labs did not return a complete SPZ and collider asset or panorama."
      : "World Labs did not return a usable SPZ tier or panorama."
  };
}
