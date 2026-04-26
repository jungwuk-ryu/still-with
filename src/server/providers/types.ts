import type {
  MotionClip,
  PetProfile,
  SceneCluster,
  WorldAsset
} from "@/types";

export interface ProviderCallContext {
  projectId?: string;
  sceneClusterId?: string;
  signal?: AbortSignal;
}

export interface PetIdentityAnalysisInput {
  imageUrls: string[];
  clarificationAnswer?: string;
  context?: ProviderCallContext;
}

export interface PetIdentityAnalysisResult {
  petProfile: PetProfile | null;
  clarificationRequired: boolean;
  clarificationPrompt: string | null;
  raw: unknown;
}

export interface ImageSeedInput {
  prompt: string;
  sourceImageUrls?: string[];
  context?: ProviderCallContext;
}

export interface ImageSeedResult {
  imageUrls: string[];
  raw: unknown;
}

export interface RealtimeClientSecretInput {
  projectId: string;
  voice?: string;
  context?: ProviderCallContext;
}

export interface RealtimeClientSecretResult {
  clientSecret: string;
  expiresAt: string;
}

export interface OpenAIProvider {
  analyzePetIdentity(
    input: PetIdentityAnalysisInput
  ): Promise<PetIdentityAnalysisResult>;
  generateImageSeed(input: ImageSeedInput): Promise<ImageSeedResult>;
  createRealtimeClientSecret(
    input: RealtimeClientSecretInput
  ): Promise<RealtimeClientSecretResult>;
}

export interface WorldLabsCreateWorldInput {
  sceneCluster: SceneCluster;
  seedImageUrls: string[];
  seedImages?: Array<{
    url: string;
    view?: "front" | "left" | "right" | "back" | "panorama";
    azimuth?: number | null;
  }>;
  inputMode?: "multi-image" | "panorama" | "single-image";
  textPrompt?: string;
  displayName?: string;
  model?: string;
  idempotencyKey?: string;
  context?: ProviderCallContext;
}

export interface WorldLabsOperation {
  operationId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  worldId: string | null;
  raw: unknown;
}

export interface WorldLabsProvider {
  createWorld(input: WorldLabsCreateWorldInput): Promise<WorldLabsOperation>;
  getOperation(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<WorldLabsOperation>;
  getWorldAssets(
    worldId: string,
    context?: ProviderCallContext
  ): Promise<WorldAsset>;
}

export interface SoraMotionInput {
  petProfile: PetProfile;
  motionKey: string;
  fromState: string;
  toState: string;
  prompt: string;
  keyframeImageUrls: string[];
  context?: ProviderCallContext;
}

export interface SoraOperation {
  operationId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  motionClip: MotionClip | null;
  raw: unknown;
}

export interface SoraProvider {
  createMotionClip(input: SoraMotionInput): Promise<SoraOperation>;
  getMotionClip(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<SoraOperation>;
}

export interface ProviderOptions {
  apiKey?: string;
}
