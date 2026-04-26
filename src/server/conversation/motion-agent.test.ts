import { describe, expect, it } from "vitest";
import type { MotionClip, PetRuntimeState } from "@/types";
import { selectMotionIntentWithAgent } from "./motion-agent";

const runtimeState: PetRuntimeState = {
  projectId: "project-1",
  currentPose: "stand",
  targetPose: null,
  currentClipId: null,
  queuedMotionKeys: [],
  lastUserIntent: null,
  lastUpdatedAt: "2026-04-26T00:00:00.000Z"
};

function createClip(motionKey: string, fromState: string, toState: string): MotionClip {
  return {
    id: `clip-${motionKey}`,
    projectId: "project-1",
    petProfileId: "pet-1",
    motionKey,
    fromState,
    toState,
    prompt: `${motionKey} calmly`,
    keyframeImageUrls: [],
    rawVideoUrl: null,
    processedVideoUrl: `/api/storage/pets/${motionKey}.mp4`,
    alphaVideoUrl: null,
    durationMs: 1800,
    loopable: motionKey === "sit" || motionKey === "stand_idle",
    qualityScore: 0.8,
    providerOperationId: null,
    providerName: null,
    providerStatus: null,
    providerErrorMessage: null,
    postprocess: null,
    status: "ready"
  };
}

describe("motion intent agent", () => {
  it("uses the LLM decision for non-English pet commands", async () => {
    let requestBody: unknown;
    const fetchImpl: typeof fetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "sit",
            confidence: 0.98,
            reason: "The Korean command asks the pet to sit."
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    };

    const decision = await selectMotionIntentWithAgent(
      {
        message: "앉아!",
        motionClips: [
          createClip("stand_idle", "stand", "stand"),
          createClip("stand_to_sit", "stand", "sit"),
          createClip("sit", "sit", "sit")
        ],
        runtimeState
      },
      {
        apiKey: "test-key",
        apiBaseUrl: "https://openai.test/v1",
        fetchImpl,
        model: "test-motion-model"
      }
    );

    expect(decision).toEqual({
      intent: "sit",
      model: "test-motion-model",
      source: "llm"
    });
    expect(JSON.stringify(requestBody)).toContain("stand_to_sit");
    expect(JSON.stringify(requestBody)).toContain("currentPetPose");
  });

  it("falls back without semantic word matching when the agent is unavailable", async () => {
    const decision = await selectMotionIntentWithAgent(
      {
        message: "앉아!",
        motionClips: [createClip("stand_to_sit", "stand", "sit")],
        runtimeState
      },
      {
        apiKey: null
      }
    );

    expect(decision).toEqual({
      intent: "look_at_me",
      model: null,
      source: "fallback"
    });
  });
});
