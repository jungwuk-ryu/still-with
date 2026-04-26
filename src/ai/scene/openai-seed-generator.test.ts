import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalStorageDriver } from "@/server/storage";
import type { StorageDriver } from "@/server/storage";
import { OpenAISceneSeedGenerator } from "./openai-seed-generator";

let tmpDir: string | null = null;

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("OpenAISceneSeedGenerator", () => {
  it("uses image edit generation when representative source images exist", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    await storage.putObject({
      key: "projects/project-1/uploads/reference.jpg",
      body: "reference-image",
      contentType: "image/jpeg"
    });
    const calls: Array<{ url: string; body: FormData }> = [];
    const fetchImpl: typeof fetch = async (url, init = {}) => {
      calls.push({
        url: String(url),
        body: init.body as FormData
      });
      return new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("generated-image").toString("base64") }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage
    });

    const seed = await generator.generateSeed({
      projectId: "project-1",
      sceneClusterId: "scene-1",
      view: "front",
      prompt: "A quiet room empty of pets, people, and all other animals.",
      sourceImageUrls: ["/api/storage/projects/project-1/uploads/reference.jpg"]
    });

    expect(calls[0]?.url).toBe("https://api.openai.com/v1/images/edits");
    expect(calls[0]?.body.get("model")).toBe("gpt-image-2");
    expect(calls[0]?.body.get("prompt")).toBe(
      "A quiet room empty of pets, people, and all other animals."
    );
    expect(calls[0]?.body.getAll("image[]")).toHaveLength(1);
    expect(calls[0]?.body.get("output_format")).toBe("png");
    expect(calls[0]?.body.get("moderation")).toBe("auto");
    expect(seed).toMatchObject({
      view: "front"
    });
    expect(seed.url).toMatch(
      /^\/api\/storage\/projects\/project-1\/space-seeds\/scene-1\/front\.png\?token=[a-f0-9]{64}$/
    );
    await expect(
      storage.getObject("projects/project-1/space-seeds/scene-1/front.png")
    ).resolves.toMatchObject({
      body: Buffer.from("generated-image")
    });
  });

  it("rejects source image URLs outside the project storage prefix", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl: async () => new Response("{}", { status: 200 }),
      storage
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: ["/api/storage/projects/project-2/uploads/private.jpg"]
      })
    ).rejects.toThrow("Storage-backed provider image URL is outside this project.");
  });

  it("stores generated images returned as fetchable URLs", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));

      if (String(url) === "https://api.openai.com/v1/images/generations") {
        return new Response(
          JSON.stringify({
            data: [{ url: "https://openai.example/generated.png" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(Buffer.from("generated-from-url"), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      });
    };
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage
    });

    const seed = await generator.generateSeed({
      projectId: "project-1",
      sceneClusterId: "scene-1",
      view: "back",
      prompt: "A quiet room.",
      sourceImageUrls: []
    });

    expect(calls).toEqual([
      "https://api.openai.com/v1/images/generations",
      "https://openai.example/generated.png"
    ]);
    expect(seed.url).toMatch(
      /^\/api\/storage\/projects\/project-1\/space-seeds\/scene-1\/back\.png\?token=[a-f0-9]{64}$/
    );
    await expect(
      storage.getObject("projects/project-1/space-seeds/scene-1/back.png")
    ).resolves.toMatchObject({
      body: Buffer.from("generated-from-url")
    });
  });

  it("times out returned image downloads instead of waiting indefinitely", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const fetchImpl: typeof fetch = async (url, init = {}) => {
      if (String(url) === "https://api.openai.com/v1/images/generations") {
        return new Response(
          JSON.stringify({
            data: [{ url: "https://openai.example/generated.png" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;

        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }

        signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true
        });
      });
    };
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage,
      downloadTimeoutMs: 1
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: []
      })
    ).rejects.toThrow("OpenAI scene seed image download timed out after 1 ms.");
  });

  it("falls back to prompt generation when image edits are rejected", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    await storage.putObject({
      key: "projects/project-1/uploads/reference.jpg",
      body: "reference-image",
      contentType: "image/jpeg"
    });
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));

      if (String(url) === "https://api.openai.com/v1/images/edits") {
        return new Response(
          JSON.stringify({
            error: {
              code: "invalid_request_error",
              message: "image edit was rejected"
            }
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "x-request-id": "req-edit"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("fallback-image").toString("base64") }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage
    });

    const seed = await generator.generateSeed({
      projectId: "project-1",
      sceneClusterId: "scene-1",
      view: "front",
      prompt: "A quiet room.",
      sourceImageUrls: ["/api/storage/projects/project-1/uploads/reference.jpg"]
    });

    expect(calls).toEqual([
      "https://api.openai.com/v1/images/edits",
      "https://api.openai.com/v1/images/generations"
    ]);
    await expect(
      storage.getObject("projects/project-1/space-seeds/scene-1/front.png")
    ).resolves.toMatchObject({
      body: Buffer.from("fallback-image")
    });
    expect(seed.view).toBe("front");
  });

  it("does not fall back to prompt generation for transient edit failures", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    await storage.putObject({
      key: "projects/project-1/uploads/reference.jpg",
      body: "reference-image",
      contentType: "image/jpeg"
    });
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          error: {
            code: "rate_limit_exceeded",
            message: "try again later"
          }
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "req-rate-limit"
          }
        }
      );
    };
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: ["/api/storage/projects/project-1/uploads/reference.jpg"]
      })
    ).rejects.toThrow(
      "OpenAI scene seed edit generation failed with HTTP 429 request_id=req-rate-limit rate_limit_exceeded: try again later"
    );
    expect(calls).toEqual(["https://api.openai.com/v1/images/edits"]);
  });

  it("does not fall back to prompt generation for edit contract errors", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    await storage.putObject({
      key: "projects/project-1/uploads/reference.jpg",
      body: "reference-image",
      contentType: "image/jpeg"
    });
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          error: {
            code: "invalid_request_error",
            message: "Unsupported parameter: image"
          }
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "req-contract"
          }
        }
      );
    };
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: ["/api/storage/projects/project-1/uploads/reference.jpg"]
      })
    ).rejects.toThrow(
      "OpenAI scene seed edit generation failed with HTTP 400 request_id=req-contract invalid_request_error: Unsupported parameter: image"
    );
    expect(calls).toEqual(["https://api.openai.com/v1/images/edits"]);
  });

  it("times out image generation requests instead of waiting indefinitely", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const fetchImpl: typeof fetch = async (_url, init = {}) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;

        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }

        signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true
        });
      });
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage,
      requestTimeoutMs: 1
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: []
      })
    ).rejects.toThrow(
      "OpenAI scene seed prompt generation timed out after 1 ms."
    );
  });

  it("times out image edit requests instead of waiting indefinitely", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    await storage.putObject({
      key: "projects/project-1/uploads/reference.jpg",
      body: "reference-image",
      contentType: "image/jpeg"
    });
    const fetchImpl: typeof fetch = async (_url, init = {}) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;

        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }

        signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true
        });
      });
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl,
      storage,
      requestTimeoutMs: 1
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: ["/api/storage/projects/project-1/uploads/reference.jpg"]
      })
    ).rejects.toThrow("OpenAI scene seed edit generation timed out after 1 ms.");
  });

  it("rejects unsupported OpenAI image payloads", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-openai-seeds-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [{}] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }),
      storage
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: []
      })
    ).rejects.toThrow(
      "OpenAI scene seed generation returned an unsupported image payload."
    );
  });

  it("sanitizes storage write errors before they can be persisted by jobs", async () => {
    const generator = new OpenAISceneSeedGenerator({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from("generated-image").toString("base64") }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
      storage: createThrowingStorage("/tmp/still-with-secret/generated.png")
    });

    await expect(
      generator.generateSeed({
        projectId: "project-1",
        sceneClusterId: "scene-1",
        view: "front",
        prompt: "A quiet room.",
        sourceImageUrls: []
      })
    ).rejects.toThrow("Generated scene seed image could not be stored.");
  });
});

function createThrowingStorage(pathInError: string): StorageDriver {
  return {
    async putObject() {
      throw new Error(`EACCES: permission denied, open '${pathInError}'`);
    },
    async getObject() {
      throw new Error("not used");
    },
    async deleteObject() {},
    getObjectUrl(key: string) {
      return `/api/storage/${key}`;
    }
  };
}
