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

export const MAX_SPACE_PREVIEW_IMAGES = 2;

const ABSENCE_REQUIREMENT =
  "The space must be completely empty of pets, people, and all other animals.";

const WORLD_PROMPT_REQUIREMENT =
  "Preserve believable room scale, navigable floor space, soft bright memorial lighting, and real-world materials.";

const DEFAULT_SPATIAL_PROMPT =
  "A calm, familiar indoor memory space reconstructed from uploaded photos.";

export const SPACE_RECONSTRUCTION_PROMPT_VERSION = "photogrammetry-reconstruction-v1";

export const RECONSTRUCTED_SPACE_IMAGE_PROMPT = [
  "Create an image that looks like a high-quality 3D reconstruction of a real-world space generated from multiple photographs using advanced photogrammetry or Gaussian splatting.",
  "The result should closely match real-world geometry and appearance, almost indistinguishable from reality at first glance.",
  "Quality: highly detailed and accurate geometry, realistic proportions and spatial consistency, sharp high-resolution textures derived from real images, and consistent lighting and color across the scene.",
  "Subtle imperfections are important: slight surface noise or uneven mesh in less visible areas, minor texture seams or blending artifacts, small floating fragments or soft edges in complex regions, and very subtle reconstruction errors that are not distracting.",
  "Camera: natural perspective, eye-level or slightly elevated, similar to viewing a reconstructed 3D model in a viewer.",
  "Style: clean but still recognizably reconstructed, not CGI perfect, like a near-final photogrammetry or NeRF result.",
  "Background: any area outside the reconstructed place should be neutral studio white or light gray.",
  "Important: Do NOT stylize or make it artistic. Do NOT make it look like a perfect CGI render. It should feel like a real place reconstructed into 3D with very high fidelity."
].join(" ");

export interface PlanSceneSeedsInput {
  cluster: SceneCluster | ClassifiedSceneCluster;
  uploadedImages: UploadedImage[];
  allowDirectUploadedSeedImages?: boolean;
}

export function planSceneSeeds(input: PlanSceneSeedsInput): SceneSeedPlan {
  const strategy = getSeedStrategy(input.cluster);
  const sourceSpatialPrompt = buildSourceSpatialPrompt(input.cluster);
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
        sourceSpatialPrompt,
        worldPrompt,
        seedPromptVersion: SPACE_RECONSTRUCTION_PROMPT_VERSION,
        seedImages: directImages.slice(0, MAX_SPACE_PREVIEW_IMAGES)
      };
    }
  }

  if (strategy === "generated-panorama") {
    return {
      strategy,
      sourceSpatialPrompt,
      worldPrompt,
      seedPromptVersion: SPACE_RECONSTRUCTION_PROMPT_VERSION,
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
    sourceSpatialPrompt,
    worldPrompt,
    seedPromptVersion: SPACE_RECONSTRUCTION_PROMPT_VERSION,
    seedImages: HORIZONTAL_SCENE_VIEWS.slice(0, MAX_SPACE_PREVIEW_IMAGES).map(
      (direction) => ({
        view: direction.view,
        azimuth: direction.azimuth,
        url: null,
        sourceImageId: null,
        prompt: buildSceneSeedPrompt(input.cluster, direction.view)
      })
    )
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
  const spatialPrompt = buildSourceSpatialPrompt(cluster);

  return [
    `${label}.`,
    spatialPrompt,
    RECONSTRUCTED_SPACE_IMAGE_PROMPT,
    ABSENCE_REQUIREMENT,
    WORLD_PROMPT_REQUIREMENT
  ].join(" ");
}

export function buildSourceSpatialPrompt(
  cluster: SceneCluster | ClassifiedSceneCluster
): string {
  const label = "label" in cluster ? cluster.label : "Memory space";
  const rawSpatialPrompt =
    "spatialPrompt" in cluster && cluster.spatialPrompt
      ? cluster.spatialPrompt
      : DEFAULT_SPATIAL_PROMPT;
  const normalizedPrompt = stripGeneratedWorldPromptText(rawSpatialPrompt, label);

  return normalizedPrompt || DEFAULT_SPATIAL_PROMPT;
}

function stripGeneratedWorldPromptText(value: string, label: string): string {
  let prompt = value.trim();

  for (const generatedInstruction of [
    RECONSTRUCTED_SPACE_IMAGE_PROMPT,
    ABSENCE_REQUIREMENT,
    WORLD_PROMPT_REQUIREMENT
  ]) {
    prompt = prompt.split(generatedInstruction).join(" ");
  }

  const labelPrefix = `${label}.`;

  while (prompt.startsWith(labelPrefix)) {
    prompt = prompt.slice(labelPrefix.length).trim();
  }

  return prompt.replace(/\s+/g, " ").trim();
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
