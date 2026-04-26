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
    title: "Waking the memory",
    description: "Letting the familiar colors and shapes return from your photos.",
    projectStatuses: ["uploading", "analyzing"],
    jobTypes: ["pet-analysis", "scene-classification"]
  },
  {
    index: 1,
    title: "Following the familiar trace",
    description: "Looking for the small details that still feel close.",
    projectStatuses: ["analyzing", "clarification_required"],
    jobTypes: ["pet-selection"]
  },
  {
    index: 2,
    title: "Letting the room come back",
    description: "Drawing out the light, walls, and quiet corners from the images.",
    projectStatuses: ["preparing_space"],
    jobTypes: ["space-seed"]
  },
  {
    index: 3,
    title: "Stepping into the dream",
    description: "Giving the space depth without losing its softness.",
    projectStatuses: ["preparing_space"],
    jobTypes: ["worldlabs-generation"]
  },
  {
    index: 4,
    title: "Bringing back a gentle presence",
    description: "Preparing a small movement that belongs naturally in the room.",
    projectStatuses: ["preparing_pet"],
    jobTypes: ["pet-keyframe", "pet-video", "video-postprocess"]
  },
  {
    index: 5,
    title: "Listening for the right feeling",
    description: "Keeping the result close, quiet, and respectful.",
    projectStatuses: ["preparing_pet"],
    jobTypes: ["quality-evaluation"]
  },
  {
    index: 6,
    title: "The door is open",
    description: "Your memory space is ready when you are.",
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
