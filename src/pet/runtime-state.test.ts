import { describe, expect, it } from "vitest";
import {
  completeQueuedMotion,
  createInitialPetRuntimeState,
  enqueueMotionPlan
} from "./runtime-state";
import { planPetTransition } from "./transition-planner";

describe("pet runtime state machine", () => {
  it("dedupes rapid repeated commands while preserving the queued plan", () => {
    const initial = {
      ...createInitialPetRuntimeState("project-1", new Date("2026-04-26T00:00:00.000Z")),
      currentPose: "sit"
    };
    const plan = planPetTransition({
      currentPose: initial.currentPose,
      userCommand: "turn around"
    });
    const first = enqueueMotionPlan(initial, plan, {
      now: new Date("2026-04-26T00:00:01.000Z")
    });
    const repeated = enqueueMotionPlan(first, plan, {
      now: new Date("2026-04-26T00:00:01.500Z")
    });

    expect(first.queuedMotionKeys).toEqual([
      "sit_to_stand",
      "turn_360",
      "stand_idle"
    ]);
    expect(repeated.queuedMotionKeys).toEqual(first.queuedMotionKeys);
    expect(repeated.lastUserIntent).toBe("turn_360");
  });

  it("updates pose as queued transition clips complete", () => {
    const initial = createInitialPetRuntimeState(
      "project-1",
      new Date("2026-04-26T00:00:00.000Z")
    );
    const plan = planPetTransition({
      currentPose: "stand",
      userCommand: "sit"
    });
    const queued = enqueueMotionPlan(initial, plan, {
      now: new Date("2026-04-26T00:00:01.000Z")
    });
    const afterTransition = completeQueuedMotion(queued, "stand_to_sit", {
      now: new Date("2026-04-26T00:00:02.000Z")
    });
    const afterIdle = completeQueuedMotion(afterTransition, "sit", {
      now: new Date("2026-04-26T00:00:03.000Z")
    });

    expect(queued.queuedMotionKeys).toEqual(["stand_to_sit", "sit"]);
    expect(afterTransition.currentPose).toBe("sit");
    expect(afterTransition.queuedMotionKeys).toEqual(["sit"]);
    expect(afterIdle.currentPose).toBe("sit");
    expect(afterIdle.targetPose).toBeNull();
    expect(afterIdle.queuedMotionKeys).toEqual([]);
  });
});
