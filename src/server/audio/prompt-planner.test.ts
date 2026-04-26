import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStorageDriver } from "@/server/storage";
import type { PetProfile } from "@/types";
import { createAudioPromptPlanner } from "./prompt-planner";

let tmpDir: string | null = null;

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("audio prompt planner", () => {
  it("sends storage-backed images to GPT-5.4 as data URLs", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-audio-plan-"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const image = await storage.putObject({
      key: "projects/project-1/uploads/pet.png",
      body: Buffer.from("image-bytes"),
      contentType: "image/png"
    });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        model: string;
        input: Array<{
          content: Array<{ type: string; image_url?: string; text?: string }>;
        }>;
      };
      const content = body.input.flatMap((item) => item.content);

      expect(body.model).toBe("gpt-5.4");
      expect(content.some((item) => item.text?.includes("small white dog"))).toBe(
        true
      );
      expect(content.some((item) => item.image_url?.startsWith("data:image/png")))
        .toBe(true);

      return Response.json({
        output_text: JSON.stringify({
          backgroundMusicPrompt: "quiet room music",
          petSoundEffects: {
            look_at_me: "soft head turn",
            turn_around: "soft paw turn",
            sit: "soft sit",
            come_closer: "soft steps"
          }
        })
      });
    });
    const planner = createAudioPromptPlanner({
      apiKey: "openai-key",
      fetchImpl,
      storage,
      model: "gpt-5.4"
    });

    const plan = await planner?.planAudioPrompts({
      projectId: "project-1",
      petProfile: createPetProfile(),
      sceneLabel: "Living room",
      spatialPrompt: "Warm afternoon light.",
      imageUrls: [image.url]
    });

    expect(plan).toMatchObject({
      source: "llm",
      model: "gpt-5.4",
      backgroundMusicPrompt: "quiet room music"
    });
  });

  it("can use Gemini 3.1 Pro with inline image data", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-audio-plan-"));
    const storage = new LocalStorageDriver(path.join(tmpDir, "storage"));
    const image = await storage.putObject({
      key: "projects/project-1/uploads/pet.png",
      body: Buffer.from("image-bytes"),
      contentType: "image/png"
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toContain(
        "/models/gemini-3.1-pro:generateContent"
      );
      const body = JSON.parse(init?.body as string) as {
        contents: Array<{
          parts: Array<{ inlineData?: { mimeType: string; data: string } }>;
        }>;
      };

      expect(body.contents[0]?.parts.some((part) => part.inlineData?.data)).toBe(
        true
      );

      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    backgroundMusicPrompt: "gemini room music",
                    petSoundEffects: {
                      look_at_me: "gemini head turn",
                      turn_around: "gemini paw turn",
                      sit: "gemini sit",
                      come_closer: "gemini steps"
                    }
                  })
                }
              ]
            }
          }
        ]
      });
    });
    const planner = createAudioPromptPlanner({
      apiKey: "gemini-key",
      fetchImpl,
      storage,
      model: "gemini-3.1-pro"
    });

    const plan = await planner?.planAudioPrompts({
      projectId: "project-1",
      petProfile: createPetProfile(),
      sceneLabel: "Living room",
      spatialPrompt: "Warm afternoon light.",
      imageUrls: [image.url]
    });

    expect(plan).toMatchObject({
      source: "llm",
      model: "gemini-3.1-pro",
      backgroundMusicPrompt: "gemini room music"
    });
  });
});

function createPetProfile(): PetProfile {
  return {
    id: "pet-profile-1",
    projectId: "project-1",
    sourceCandidateIds: ["candidate-1"],
    species: "dog",
    name: null,
    traitSummary: "small white dog with brown ears",
    distinctiveMarkings: ["brown ears"],
    faceDescription: "soft face",
    bodyDescription: "small body",
    accessories: [],
    selectionConfidence: 0.93,
    clarificationRequired: false,
    clarificationAnswer: null
  };
}
