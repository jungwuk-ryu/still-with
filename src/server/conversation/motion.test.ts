import { describe, expect, it } from "vitest";
import type { MotionClip, PetRuntimeState } from "@/types";
import { inferMotionIntent, planMotionFromClips } from "./motion";

const runtimeState: PetRuntimeState = {
  projectId: "project-1",
  currentPose: "stand",
  targetPose: null,
  currentClipId: null,
  queuedMotionKeys: [],
  lastUserIntent: null,
  lastUpdatedAt: "2026-04-26T00:00:00.000Z"
};

const clip: MotionClip = {
  id: "clip-1",
  projectId: "project-1",
  petProfileId: "pet-1",
  motionKey: "sit",
  fromState: "stand",
  toState: "sit",
  prompt: "sit calmly",
  keyframeImageUrls: [],
  rawVideoUrl: null,
  processedVideoUrl: "/api/storage/pets/sit.mp4",
  alphaVideoUrl: null,
  durationMs: 1800,
  loopable: false,
  qualityScore: 0.8,
  status: "ready"
};

describe("motion intent planning", () => {
  it("detects direct motion requests", () => {
    expect(inferMotionIntent("Can you sit down here?")).toBe("sit");
    expect(inferMotionIntent("come closer to me")).toBe("come_closer");
    expect(inferMotionIntent("turn around once")).toBe("turn_around");
  });

  it("selects ready clips from the pet contract", () => {
    const motion = planMotionFromClips("sit", [clip], runtimeState);

    expect(motion.clipId).toBe("clip-1");
    expect(motion.videoUrl).toBe("/api/storage/pets/sit.mp4");
    expect(motion.toState).toBe("sit");
    expect(motion.sequenceId).toEqual(expect.any(String));
  });
});
