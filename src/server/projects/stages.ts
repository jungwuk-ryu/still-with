import type { GenerationJobType, ProjectStatus } from "@/types";

export interface LoadingStage {
  index: number;
  title: string;
  description: string;
  projectStatuses: ProjectStatus[];
  jobTypes: GenerationJobType[];
}

export const LOADING_STAGES: LoadingStage[] = [
  {
    index: 0,
    title: "Looking through your memories",
    description: "Finding the moments, colors, and places that appear in your photos.",
    projectStatuses: ["uploading", "analyzing"],
    jobTypes: ["pet-analysis", "scene-classification"]
  },
  {
    index: 1,
    title: "Finding what feels familiar",
    description: "Noticing the little details that made them feel like them.",
    projectStatuses: ["analyzing", "clarification_required"],
    jobTypes: ["pet-selection"]
  },
  {
    index: 2,
    title: "Remembering the light",
    description: "Shaping the room with the warmth and light from your photos.",
    projectStatuses: ["preparing_space"],
    jobTypes: ["space-seed"]
  },
  {
    index: 3,
    title: "Making the space feel calm",
    description: "Giving the memory space a quiet sense of depth.",
    projectStatuses: ["preparing_space"],
    jobTypes: ["worldlabs-generation"]
  },
  {
    index: 4,
    title: "Preparing a gentle presence",
    description: "Creating soft movement that belongs naturally in the space.",
    projectStatuses: ["preparing_pet"],
    jobTypes: ["pet-keyframe", "pet-video", "video-postprocess"]
  },
  {
    index: 5,
    title: "Checking the feeling",
    description: "Making sure the result feels close, respectful, and gentle.",
    projectStatuses: ["preparing_pet"],
    jobTypes: ["quality-evaluation"]
  },
  {
    index: 6,
    title: "Ready when you are",
    description: "Your memory space is ready to enter.",
    projectStatuses: ["ready"],
    jobTypes: []
  }
];

export const TOTAL_LOADING_STEPS = LOADING_STAGES.length;

export function getLoadingStage(index: number): LoadingStage {
  const clampedIndex = Math.max(0, Math.min(TOTAL_LOADING_STEPS - 1, index));
  return LOADING_STAGES[clampedIndex];
}

export function getStageIndexForJobType(jobType: GenerationJobType): number {
  return (
    LOADING_STAGES.find((stage) => stage.jobTypes.includes(jobType))?.index ?? 0
  );
}

export function getDefaultStageIndexForStatus(status: ProjectStatus): number {
  switch (status) {
    case "draft":
    case "uploading":
      return 0;
    case "analyzing":
    case "clarification_required":
      return 1;
    case "preparing_space":
      return 2;
    case "preparing_pet":
      return 4;
    case "ready":
      return 6;
    case "failed":
    case "cancelled":
      return 0;
    default:
      return 0;
  }
}
