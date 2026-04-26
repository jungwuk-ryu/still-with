import type { UploadedImage } from "@/types";

export type SceneSeedStrategy =
  | "direct-multi-image"
  | "generated-multiview"
  | "generated-panorama";

export type SceneSeedView = "front" | "left" | "right" | "back" | "panorama";

export interface SceneInputImage extends UploadedImage {
  description?: string | null;
}

export interface ClassifiedSceneCluster {
  label: string;
  sourceImageIds: string[];
  representativeImageIds: string[];
  directWorldInputImageIds: string[];
  spatialPrompt: string;
  visualEvidence: string[];
  seedStrategy: SceneSeedStrategy;
  confidence: number;
}

export interface SceneClassificationResult {
  projectId: string;
  primaryCluster: ClassifiedSceneCluster;
  clusters: ClassifiedSceneCluster[];
  raw: unknown;
}

export interface SceneClassifierInput {
  projectId: string;
  images: SceneInputImage[];
}

export interface SceneClassifier {
  classify(input: SceneClassifierInput): Promise<SceneClassificationResult>;
}

export interface PlannedSeedImage {
  view: SceneSeedView;
  azimuth: number | null;
  url: string | null;
  sourceImageId: string | null;
  prompt: string;
}

export interface SceneSeedPlan {
  strategy: SceneSeedStrategy;
  sourceSpatialPrompt: string;
  worldPrompt: string;
  seedPromptVersion: string;
  seedImages: PlannedSeedImage[];
}

export interface GeneratedSeedImage {
  view: SceneSeedView;
  azimuth: number | null;
  url: string;
  prompt: string;
}

export interface SceneSeedGeneratorInput {
  projectId: string;
  sceneClusterId: string;
  view: SceneSeedView;
  prompt: string;
  sourceImageUrls: string[];
}

export interface SceneSeedGenerator {
  generateSeed(input: SceneSeedGeneratorInput): Promise<GeneratedSeedImage>;
}
