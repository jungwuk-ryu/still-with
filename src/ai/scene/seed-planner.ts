import type { SceneCluster, UploadedImage } from "@/types";
import type {
  ClassifiedSceneCluster,
  PlannedSeedImage,
  SceneSeedPlan,
  SceneSeedStrategy,
  SceneSeedView
} from "./types";

export const HORIZONTAL_SCENE_VIEWS: Array<{
  view: Exclude<SceneSeedView, "panorama">;
  azimuth: number;
}> = [
  { view: "front", azimuth: 0 },
  { view: "left", azimuth: 270 },
  { view: "right", azimuth: 90 },
  { view: "back", azimuth: 180 }
];

const ABSENCE_REQUIREMENT =
  "The space must be completely empty of pets, people, and all other animals.";

export interface PlanSceneSeedsInput {
  cluster: SceneCluster | ClassifiedSceneCluster;
  uploadedImages: UploadedImage[];
  allowDirectUploadedSeedImages?: boolean;
}

export function planSceneSeeds(input: PlanSceneSeedsInput): SceneSeedPlan {
  const strategy = getSeedStrategy(input.cluster);
  const worldPrompt = buildWorldPrompt(input.cluster);

  if (strategy === "direct-multi-image" && input.allowDirectUploadedSeedImages) {
    const directIds = getDirectWorldInputImageIds(input.cluster);
    const directImages = directIds.reduce<PlannedSeedImage[]>(
      (images, imageId, index) => {
        const image = input.uploadedImages.find((candidate) => candidate.id === imageId);
        const direction = HORIZONTAL_SCENE_VIEWS[index % HORIZONTAL_SCENE_VIEWS.length];

        if (image) {
          images.push({
            view: direction.view,
            azimuth: direction.azimuth,
            url: image.originalUrl,
            sourceImageId: image.id,
            prompt: worldPrompt
          });
        }

        return images;
      },
      []
    );

    if (directImages.length >= 2) {
      return {
        strategy,
        worldPrompt,
        seedImages: directImages.slice(0, HORIZONTAL_SCENE_VIEWS.length)
      };
    }
  }

  if (strategy === "generated-panorama") {
    return {
      strategy,
      worldPrompt,
      seedImages: [
        {
          view: "panorama",
          azimuth: null,
          url: null,
          sourceImageId: null,
          prompt: buildSceneSeedPrompt(input.cluster, "panorama")
        }
      ]
    };
  }

  return {
    strategy: "generated-multiview",
    worldPrompt,
    seedImages: HORIZONTAL_SCENE_VIEWS.map((direction) => ({
      view: direction.view,
      azimuth: direction.azimuth,
      url: null,
      sourceImageId: null,
      prompt: buildSceneSeedPrompt(input.cluster, direction.view)
    }))
  };
}

export function buildSceneSeedPrompt(
  cluster: SceneCluster | ClassifiedSceneCluster,
  view: SceneSeedView
): string {
  const viewInstruction =
    view === "panorama"
      ? "Create one 2:1 equirectangular panorama of the same place."
      : `Create the ${view} horizontal view of the same place.`;

  return [
    viewInstruction,
    buildWorldPrompt(cluster),
    ABSENCE_REQUIREMENT,
    "No pet beds with animals, no animal toys shaped like living animals, no portraits of people, no mirrors reflecting people.",
    "Leave a clear, uncluttered floor area near the visual center where a single pet video can later stand.",
    "Keep furniture, windows, floor material, wall color, lighting direction, and room layout consistent across views.",
    "Use subtle dreamlike brightness with soft daylight and warm highlights, but keep the space realistic and faithful to the uploaded photos.",
    "Do not create top or bottom cube-map images."
  ].join(" ");
}

export function buildWorldPrompt(
  cluster: SceneCluster | ClassifiedSceneCluster
): string {
  const label = "label" in cluster ? cluster.label : "Memory space";
  const spatialPrompt =
    "spatialPrompt" in cluster && cluster.spatialPrompt
      ? cluster.spatialPrompt
      : "A calm, familiar indoor memory space reconstructed from uploaded photos.";

  return [
    `${label}.`,
    spatialPrompt,
    ABSENCE_REQUIREMENT,
    "Preserve believable room scale, navigable floor space, soft bright memorial lighting, and real-world materials."
  ].join(" ");
}

function getSeedStrategy(
  cluster: SceneCluster | ClassifiedSceneCluster
): SceneSeedStrategy {
  if ("seedStrategy" in cluster) {
    return cluster.seedStrategy;
  }

  return cluster.representativeImageIds.length >= 2
    ? "direct-multi-image"
    : "generated-multiview";
}

function getDirectWorldInputImageIds(
  cluster: SceneCluster | ClassifiedSceneCluster
): string[] {
  if ("directWorldInputImageIds" in cluster) {
    return cluster.directWorldInputImageIds;
  }

  return cluster.representativeImageIds;
}
