import { afterEach, describe, expect, it, vi } from "vitest";
import { createVeoProvider } from "./veo";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createVeoProvider", () => {
  it("serializes Veo image-to-video requests without enabling people generation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            name: "models/veo-3.1-generate-preview/operations/test-op"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );
    const provider = createVeoProvider({ apiKey: "test-gemini-key" });

    const operation = await provider.createMotionClip({
      petProfile: {
        id: "pet-profile-1",
        projectId: "project-1",
        sourceCandidateIds: [],
        species: "cat",
        name: null,
        traitSummary: "black cat silhouette",
        distinctiveMarkings: [],
        faceDescription: null,
        bodyDescription: null,
        accessories: [],
        selectionConfidence: 1,
        clarificationRequired: false,
        clarificationAnswer: null
      },
      motionKey: "stand_idle",
      fromState: "stand",
      toState: "stand",
      prompt:
        "exactly one selected pet only. no people, no other animals, no props, no complex background.",
      keyframeImageUrls: ["data:image/png;base64,ZmFrZS1wbmc="]
    });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      instances: Array<{ image?: { bytesBase64Encoded?: string } }>;
      parameters: Record<string, unknown>;
    };

    expect(operation).toMatchObject({
      operationId: "models/veo-3.1-generate-preview/operations/test-op",
      status: "running"
    });
    expect(body.parameters).toMatchObject({
      aspectRatio: "16:9",
      durationSeconds: 8,
      resolution: "1080p"
    });
    expect(body.parameters.personGeneration).toBeUndefined();
    expect(body.instances[0].image).toMatchObject({
      bytesBase64Encoded: "ZmFrZS1wbmc=",
      mimeType: "image/png"
    });
  });

  it("rejects absolute operation IDs before attaching the API key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const provider = createVeoProvider({ apiKey: "test-gemini-key" });

    await expect(
      provider.getMotionClip("https://attacker.example/operation")
    ).rejects.toThrow("Veo operation name is invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-Google video download URLs without fetching them", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            name: "models/veo-3.1-generate-preview/operations/test-op",
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [
                  {
                    video: {
                      uri: "https://attacker.example/video.mp4"
                    }
                  }
                ]
              }
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );
    const provider = createVeoProvider({ apiKey: "test-gemini-key" });

    await expect(
      provider.downloadMotionClipContent(
        "models/veo-3.1-generate-preview/operations/test-op"
      )
    ).rejects.toThrow("Veo video download URI is not an allowed Google API host");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
