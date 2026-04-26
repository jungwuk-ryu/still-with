import { describe, expect, it } from "vitest";
import type { WorldAsset } from "@/types";
import { getRendererPixelRatio, selectWorldAssetUrl } from "./quality";

const baseWorldAsset: WorldAsset = {
  id: "world-asset-1",
  projectId: "project-1",
  sceneClusterId: "scene-1",
  worldId: "world-1",
  spzUrl100k: "/100k.spz",
  spzUrl500k: "/500k.spz",
  spzUrlFullRes: "/full.spz",
  colliderMeshUrl: null,
  panoUrl: null,
  thumbnailUrl: null,
  groundPlaneOffset: 0,
  initialCameraPose: null
};

describe("three quality selection", () => {
  it("caps renderer pixel ratio", () => {
    expect(getRendererPixelRatio(3)).toBe(1.5);
    expect(getRendererPixelRatio(1.25)).toBe(1.25);
  });

  it("starts with the 500k SPZ tier on normal devices", () => {
    const selected = selectWorldAssetUrl(
      baseWorldAsset,
      {
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
        isMobile: false,
        saveData: false,
        reducedMotion: false
      },
      null
    );

    expect(selected.tier).toBe("500k");
    expect(selected.url).toBe("/500k.spz");
  });

  it("uses 100k for constrained clients", () => {
    const selected = selectWorldAssetUrl(
      baseWorldAsset,
      {
        devicePixelRatio: 2,
        hardwareConcurrency: 4,
        isMobile: true,
        saveData: false,
        reducedMotion: false
      },
      null
    );

    expect(selected.tier).toBe("100k");
  });
});
