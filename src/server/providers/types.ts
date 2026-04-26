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
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
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

export interface ElevenLabsMusicInput {
  prompt: string;
  musicLengthMs?: number;
  forceInstrumental?: boolean;
  modelId?: "music_v1";
  context?: ProviderCallContext;
}

export interface ElevenLabsSoundEffectInput {
  text: string;
  durationSeconds?: number;
  loop?: boolean;
  promptInfluence?: number;
  modelId?: "eleven_text_to_sound_v2";
  context?: ProviderCallContext;
}

export interface ElevenLabsAudioResult {
  audio: Buffer;
  contentType: string;
  raw: {
    characterCost: string | null;
    songId: string | null;
    outputFormat: string;
  };
}

export interface ElevenLabsProvider {
  composeMusic(input: ElevenLabsMusicInput): Promise<ElevenLabsAudioResult>;
  createSoundEffect(
    input: ElevenLabsSoundEffectInput
  ): Promise<ElevenLabsAudioResult>;
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
  providerName: "sora";
  createMotionClip(input: SoraMotionInput): Promise<SoraOperation>;
  getMotionClip(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<SoraOperation>;
  downloadMotionClipContent(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<Buffer>;
}

export interface VeoProvider {
  providerName: "veo";
  createMotionClip(input: SoraMotionInput): Promise<SoraOperation>;
  getMotionClip(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<SoraOperation>;
  downloadMotionClipContent(
    operationId: string,
    context?: ProviderCallContext
  ): Promise<Buffer>;
}

export type MotionVideoProvider = SoraProvider | VeoProvider;

export interface ProviderOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  textModel?: string;
  imageModel?: string;
  soraModel?: string;
  veoModel?: string;
  realtimeModel?: string;
}

export interface ElevenLabsProviderOptions extends ProviderOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  outputFormat?: string;
}
