export type ISODateString = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type ProjectStatus =
  | "draft"
  | "uploading"
  | "analyzing"
  | "clarification_required"
  | "preparing_space"
  | "preparing_pet"
  | "ready"
  | "failed"
  | "cancelled";

export interface Project {
  id: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  status: ProjectStatus;
  currentStage: string | null;
  currentStepIndex: number;
  totalSteps: number;
  debugProgressPercent: number;
  selectedPetId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  completedAt: ISODateString | null;
}

export interface UploadedImage {
  id: string;
  projectId: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string;
  exifMetadata: JsonValue | null;
  uploadOrder: number;
}

export interface PetProfile {
  id: string;
  projectId: string;
  sourceCandidateIds: string[];
  species: string | null;
  name: string | null;
  traitSummary: string;
  distinctiveMarkings: string[];
  faceDescription: string | null;
  bodyDescription: string | null;
  accessories: string[];
  selectionConfidence: number;
  clarificationRequired: boolean;
  clarificationAnswer: string | null;
}

export type SceneClusterStatus =
  | "pending"
  | "selected"
  | "generating_seed"
  | "waiting_for_world"
  | "ready"
  | "failed";

export interface SceneCluster {
  id: string;
  projectId: string;
  label: string;
  sourceImageIds: string[];
  representativeImageIds: string[];
  spatialPrompt: string | null;
  seedImageUrls: string[];
  worldLabsOperationId: string | null;
  worldId: string | null;
  status: SceneClusterStatus;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface WorldAsset {
  id: string;
  projectId: string;
  sceneClusterId: string;
  worldId: string;
  spzUrl100k: string | null;
  spzUrl500k: string | null;
  spzUrlFullRes: string | null;
  colliderMeshUrl: string | null;
  panoUrl: string | null;
  thumbnailUrl: string | null;
  groundPlaneOffset: number;
  initialCameraPose: CameraPose | null;
}

export type MotionClipStatus =
  | "pending"
  | "generating_keyframes"
  | "generating_video"
  | "processing"
  | "ready"
  | "failed";

export interface MotionClip {
  id: string;
  projectId: string;
  petProfileId: string;
  motionKey: string;
  fromState: string;
  toState: string;
  prompt: string;
  keyframeImageUrls: string[];
  rawVideoUrl: string | null;
  processedVideoUrl: string | null;
  alphaVideoUrl: string | null;
  durationMs: number | null;
  loopable: boolean;
  qualityScore: number | null;
  status: MotionClipStatus;
}

export interface PetRuntimeState {
  projectId: string;
  currentPose: string;
  targetPose: string | null;
  currentClipId: string | null;
  queuedMotionKeys: string[];
  lastUserIntent: string | null;
  lastUpdatedAt: ISODateString;
}

export type GenerationJobType =
  | "pet-analysis"
  | "pet-selection"
  | "scene-classification"
  | "space-seed"
  | "worldlabs-generation"
  | "pet-keyframe"
  | "pet-video"
  | "video-postprocess"
  | "quality-evaluation"
  | "conversation";

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface GenerationJob {
  id: string;
  projectId: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  priority: number;
  payload: JsonValue;
  result: JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: ISODateString;
  lockedAt: ISODateString | null;
  lockedBy: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  completedAt: ISODateString | null;
}
