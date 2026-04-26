import { describe, expect, it } from "vitest";
import { planPetTransition } from "./transition-planner";

describe("planPetTransition", () => {
  it("routes sit to turn around through stand hub", () => {
    const plan = planPetTransition({
      currentPose: "sit",
      userCommand: "turn around"
    });

    expect(plan.motionKeys).toEqual([
      "sit_to_stand",
      "turn_360",
      "stand_idle"
    ]);
    expect(plan.finalPose).toBe("stand");
    expect(plan.usesStandHub).toBe(true);
  });

  it("enters sitting through stand_to_sit and seated idle", () => {
    const plan = planPetTransition({
      currentPose: "stand",
      userCommand: "please sit down"
    });

    expect(plan.motionKeys).toEqual(["stand_to_sit", "sit"]);
    expect(plan.finalPose).toBe("sit");
  });

  it("falls back to stand idle through the hub for unknown commands", () => {
    const plan = planPetTransition({
      currentPose: "sit",
      userCommand: "do something sweet"
    });

    expect(plan.motionKeys).toEqual(["sit_to_stand", "stand_idle"]);
    expect(plan.finalPose).toBe("stand");
  });
});
