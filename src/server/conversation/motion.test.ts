import { describe, expect, it } from "vitest";
import type { MotionClip, PetRuntimeState } from "@/types";
import {
  applyPlannedMotion,
  fallbackAssistantMessage,
  planMotionFromClips
} from "./motion";

const runtimeState: PetRuntimeState = {
  projectId: "project-1",
  currentPose: "stand",
  targetPose: null,
  currentClipId: null,
  queuedMotionKeys: [],
  lastUserIntent: null,
  lastUpdatedAt: "2026-04-26T00:00:00.000Z"
};

function createClip(
  motionKey: string,
  fromState: string,
  toState: string,
  videoUrl = `/api/storage/pets/${motionKey}.mp4`,
  loopable = false
): MotionClip {
  return {
    id: "clip-1",
    projectId: "project-1",
    petProfileId: "pet-1",
    motionKey,
    fromState,
    toState,
    prompt: `${motionKey} calmly`,
    keyframeImageUrls: [],
    rawVideoUrl: null,
    processedVideoUrl: videoUrl,
    alphaVideoUrl: null,
    durationMs: 1800,
    loopable,
    qualityScore: 0.8,
    providerOperationId: null,
    providerName: null,
    providerStatus: null,
    providerErrorMessage: null,
    postprocess: null,
    status: "ready"
  };
}

const clip = createClip(
  "stand_to_sit",
  "stand",
  "sit",
  "/api/storage/pets/sit.mp4"
);

describe("motion intent planning", () => {
  it("selects ready clips from the pet contract", () => {
    const motion = planMotionFromClips("sit", [clip], runtimeState);

    expect(motion.clipId).toBe("clip-1");
    expect(motion.videoUrl).toBe("/api/storage/pets/sit.mp4");
    expect(motion.toState).toBe("sit");
    expect(motion.sequenceId).toEqual(expect.any(String));
  });

  it.each([
    ["idle", "stand_idle", "stand"],
    ["look_at_me", "look_at_camera", "stand"],
    ["turn_around", "turn_360", "stand"],
    ["come_closer", "walk_small", "stand"],
    ["sit", "stand_to_sit", "sit"]
  ] as const)(
    "maps %s intent to canonical %s motion",
    (intent, motionKey, expectedPose) => {
      const motion = planMotionFromClips(
        intent,
        [createClip(motionKey, "stand", expectedPose)],
        runtimeState
      );
      const nextState = applyPlannedMotion(runtimeState, motion, intent);

      expect(motion.clipId).toBe("clip-1");
      expect(motion.toState).toBe(expectedPose);
      expect(nextState.currentPose).toBe(expectedPose);
    }
  );

  it("keeps fallback poses constrained when a requested clip is missing", () => {
    const motion = planMotionFromClips("come_closer", [], runtimeState);
    const nextState = applyPlannedMotion(runtimeState, motion, "come closer");

    expect(motion.clipId).toBeNull();
    expect(motion.toState).toBe("stand");
    expect(nextState.currentPose).toBe("stand");
  });

  it("keeps a sitting pet on the seated idle loop", () => {
    const sittingRuntimeState: PetRuntimeState = {
      ...runtimeState,
      currentPose: "sit"
    };
    const sittingClip = createClip(
      "sit",
      "sit",
      "sit",
      "/api/storage/pets/sit-idle.mp4",
      true
    );
    const motion = planMotionFromClips("sit", [clip, sittingClip], sittingRuntimeState);

    expect(motion.videoUrl).toBe("/api/storage/pets/sit-idle.mp4");
    expect(motion.loopable).toBe(true);
    expect(motion.toState).toBe("sit");
  });

  it("returns action status copy instead of pet dialogue", () => {
    expect(fallbackAssistantMessage("look_at_me")).toBe(
      "Your pet turns gently toward you."
    );
    expect(fallbackAssistantMessage("look_at_me")).not.toContain("I'm");
  });
});
