import { describe, expect, it, vi } from "vitest";
import { createGeminiPetPresenceDetector } from "./pet-presence";

describe("Gemini pet presence detector", () => {
  it("sends uploaded images to Gemini and parses a positive result", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    hasPet: true,
                    confidence: "medium",
                    reason: "A cat is visible on the sofa."
                  })
                }
              ]
            }
          }
        ]
      })
    );
    const detector = createGeminiPetPresenceDetector({
      apiKey: "test-gemini-key",
      fetchImpl,
      model: "gemini-test-model"
    });

    await expect(
      detector?.detectPetPresence({
        images: [
          {
            fileName: "cat.jpg",
            mimeType: "image/jpeg",
            body: Buffer.from("cat-image")
          }
        ]
      })
    ).resolves.toMatchObject({
      hasPet: true,
      confidence: "medium",
      reason: "A cat is visible on the sofa."
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as Parameters<typeof fetch>;
    const [url, init] = call;
    expect(String(url)).toContain("/models/gemini-test-model:generateContent");
    expect(String(url)).not.toContain("test-gemini-key");
    expect(init?.headers).toMatchObject({
      "x-goog-api-key": "test-gemini-key"
    });
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0]?.parts[0]?.text).toContain("image 1");
    expect(body.contents[0]?.parts[0]?.text).not.toContain("cat.jpg");
    expect(body.contents[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inlineData: {
            mimeType: "image/jpeg",
            data: Buffer.from("cat-image").toString("base64")
          }
        })
      ])
    );
  });

  it("treats incomplete Gemini JSON as an unavailable check", async () => {
    const detector = createGeminiPetPresenceDetector({
      apiKey: "test-gemini-key",
      fetchImpl: vi.fn(async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      confidence: "high",
                      reason: "No boolean was returned."
                    })
                  }
                ]
              }
            }
          ]
        })
      )
    });

    await expect(
      detector?.detectPetPresence({
        images: [
          {
            fileName: "room.png",
            mimeType: "image/png",
            body: Buffer.from("room-image")
          }
        ]
      })
    ).rejects.toThrow("invalid shape");
  });

  it("parses a fenced negative Gemini JSON response", async () => {
    const detector = createGeminiPetPresenceDetector({
      apiKey: "test-gemini-key",
      fetchImpl: vi.fn(async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "```json\n{\"hasPet\":false,\"confidence\":\"high\",\"reason\":\"No pet is visible.\"}\n```"
                  }
                ]
              }
            }
          ]
        })
      )
    });

    await expect(
      detector?.detectPetPresence({
        images: [
          {
            fileName: "room.png",
            mimeType: "image/png",
            body: Buffer.from("room-image")
          }
        ]
      })
    ).resolves.toMatchObject({
      hasPet: false,
      confidence: "high",
      reason: "No pet is visible."
    });
  });
});
