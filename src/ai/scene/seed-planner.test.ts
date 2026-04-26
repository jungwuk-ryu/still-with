import { describe, expect, it } from "vitest";
import {
  HORIZONTAL_SCENE_VIEWS,
  RECONSTRUCTED_SPACE_IMAGE_PROMPT,
  planSceneSeeds
} from "./seed-planner";
import type { ClassifiedSceneCluster } from "./types";
import type { SceneCluster, UploadedImage } from "@/types";

describe("scene seed planner", () => {
  it("uses only horizontal front/left/right/back generated seed views by default", () => {
    const plan = planSceneSeeds({
      cluster: createSceneCluster(),
      uploadedImages: [createUploadedImage("image-1")]
    });

    expect(HORIZONTAL_SCENE_VIEWS.map((view) => view.view)).toEqual([
      "front",
      "left",
      "right",
      "back"
    ]);
    expect(plan.strategy).toBe("generated-multiview");
    expect(plan.seedImages.map((seed) => seed.view)).toEqual([
      "front",
      "left",
      "right",
      "back"
    ]);
    expect(plan.seedImages[0]?.prompt).toContain(
      "empty of pets, people, and all other animals"
    );
    expect(plan.seedImages[0]?.prompt).toContain("Gaussian splatting");
    expect(plan.seedImages[0]?.prompt).toContain(
      "Do NOT make it look like a perfect CGI render"
    );
    expect(plan.worldPrompt).toContain("Gaussian splatting");
    expect(plan.sourceSpatialPrompt).toBe(
      "A soft living room with oak floors, a pale couch, and clear central floor space."
    );
    expect(plan.seedPromptVersion).toBe("photogrammetry-reconstruction-v1");
  });

  it("does not stack generated world prompt text onto persisted spatial prompts", () => {
    const plan = planSceneSeeds({
      cluster: {
        ...createSceneCluster(),
        spatialPrompt: [
          "Living room. A quiet living room.",
          RECONSTRUCTED_SPACE_IMAGE_PROMPT,
          "The space must be completely empty of pets, people, and all other animals.",
          "Preserve believable room scale, navigable floor space, soft bright memorial lighting, and real-world materials."
        ].join(" ")
      },
      uploadedImages: [createUploadedImage("image-1")]
    });

    expect(plan.sourceSpatialPrompt).toBe("A quiet living room.");
    expect(countOccurrences(plan.worldPrompt, "Gaussian splatting")).toBe(1);
    expect(
      countOccurrences(plan.worldPrompt, "Preserve believable room scale")
    ).toBe(1);
  });

  it("does not use direct uploaded image seeds unless explicitly allowed", () => {
    const plan = planSceneSeeds({
      cluster: {
        ...createSceneCluster(),
        representativeImageIds: ["image-1", "image-2"]
      },
      uploadedImages: [createUploadedImage("image-1"), createUploadedImage("image-2")]
    });

    expect(plan.strategy).toBe("generated-multiview");
    expect(plan.seedImages.every((seed) => seed.url === null)).toBe(true);
  });

  it("can use direct uploaded image seeds when a caller has already gated them", () => {
    const plan = planSceneSeeds({
      cluster: {
        ...createSceneCluster(),
        representativeImageIds: ["image-1", "image-2"]
      },
      uploadedImages: [createUploadedImage("image-1"), createUploadedImage("image-2")],
      allowDirectUploadedSeedImages: true
    });

    expect(plan.strategy).toBe("direct-multi-image");
    expect(plan.seedImages.map((seed) => seed.url)).toEqual([
      "/api/storage/projects/project-1/uploads/image-1.jpg",
      "/api/storage/projects/project-1/uploads/image-2.jpg"
    ]);
  });

  it("plans a single panorama seed for generated panorama strategy", () => {
    const plan = planSceneSeeds({
      cluster: {
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        directWorldInputImageIds: [],
        spatialPrompt:
          "A soft living room with oak floors, a pale couch, and clear central floor space.",
        visualEvidence: ["oak floors"],
        seedStrategy: "generated-panorama",
        confidence: 0.8
      } satisfies ClassifiedSceneCluster,
      uploadedImages: [createUploadedImage("image-1")]
    });

    expect(plan.strategy).toBe("generated-panorama");
    expect(plan.seedImages).toMatchObject([
      {
        view: "panorama",
        azimuth: null,
        url: null
      }
    ]);
  });
});

function createSceneCluster(): SceneCluster {
  return {
    id: "scene-1",
    projectId: "project-1",
    label: "Living room",
    sourceImageIds: ["image-1"],
    representativeImageIds: ["image-1"],
    spatialPrompt:
      "A soft living room with oak floors, a pale couch, and clear central floor space.",
    seedImageUrls: [],
    seedPromptVersion: null,
    worldLabsOperationId: null,
    worldId: null,
    status: "selected"
  };
}

function createUploadedImage(id: string): UploadedImage {
  return {
    id,
    projectId: "project-1",
    originalUrl: `/api/storage/projects/project-1/uploads/${id}.jpg`,
    thumbnailUrl: null,
    width: 1024,
    height: 768,
    mimeType: "image/jpeg",
    exifMetadata: null,
    uploadOrder: 0
  };
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
