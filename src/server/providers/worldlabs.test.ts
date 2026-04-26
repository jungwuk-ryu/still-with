import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalStorageDriver } from "@/server/storage";
import { assertRemoteProviderImageUrlAllowed } from "./image-inputs";
import { createWorldLabsProvider } from "./worldlabs";
import type { SceneCluster } from "@/types";

let previousAllowRemote: string | undefined;
let tmpDir: string | null = null;

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  if (previousAllowRemote === undefined) {
    delete process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS;
  } else {
    process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS = previousAllowRemote;
  }

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("WorldLabsHttpProvider", () => {
  it("creates a multi-image Marble request with horizontal azimuths", async () => {
    previousAllowRemote = process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS;
    process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS = "true";
    const requests: Array<{ url: string; init: RequestInit; body: unknown }> = [];
    const fetchImpl: typeof fetch = async (url, init = {}) => {
      requests.push({
        url: String(url),
        init,
        body: init.body ? JSON.parse(String(init.body)) : null
      });

      return new Response(
        JSON.stringify({
          operation_id: "operation-1",
          done: false,
          error: null,
          metadata: { world_id: "world-1" },
          response: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl,
      maxRetries: 0
    });

    const operation = await provider.createWorld({
      sceneCluster: createSceneCluster(),
      seedImageUrls: [],
      seedImages: [
        { url: "https://example.com/front.png", view: "front", azimuth: 0 },
        { url: "https://example.com/left.png", view: "left", azimuth: 270 },
        { url: "https://example.com/right.png", view: "right", azimuth: 90 },
        { url: "https://example.com/back.png", view: "back", azimuth: 180 }
      ],
      inputMode: "multi-image",
      textPrompt: "A quiet, empty living room."
    });

    expect(operation).toMatchObject({
      operationId: "operation-1",
      status: "running",
      worldId: "world-1"
    });
    expect(requests[0]?.url).toBe(
      "https://api.worldlabs.ai/marble/v1/worlds:generate"
    );
    expect(requests[0]?.init.headers).toMatchObject({
      "WLT-Api-Key": "test-key"
    });
    expect(
      (requests[0]?.init.headers as Record<string, string>)["Idempotency-Key"]
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(requests[0]?.body).toMatchObject({
      model: "marble-1.1",
      world_prompt: {
        type: "multi-image",
        text_prompt: "A quiet, empty living room."
      }
    });
    expect(
      (requests[0]?.body as { world_prompt: { multi_image_prompt: unknown[] } })
        .world_prompt.multi_image_prompt
    ).toEqual([
      {
        azimuth: 0,
        content: { source: "uri", uri: "https://example.com/front.png" }
      },
      {
        azimuth: 270,
        content: { source: "uri", uri: "https://example.com/left.png" }
      },
      {
        azimuth: 90,
        content: { source: "uri", uri: "https://example.com/right.png" }
      },
      {
        azimuth: 180,
        content: { source: "uri", uri: "https://example.com/back.png" }
      }
    ]);
  });

  it("retries world generation POSTs with a stable idempotency key", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    let callCount = 0;
    const idempotencyKeys: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init = {}) => {
      callCount += 1;
      idempotencyKeys.push(
        (init.headers as Record<string, string>)["Idempotency-Key"] ?? ""
      );

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "temporary" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          operation_id: "operation-1",
          done: false,
          error: null,
          metadata: { world_id: "world-1" },
          response: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl,
      maxRetries: 1
    });

    const operationPromise = provider.createWorld({
      sceneCluster: createSceneCluster(),
      seedImageUrls: [],
      seedImages: [
        {
          url: "data:image/png;base64,aGVsbG8=",
          view: "front",
          azimuth: 0
        },
        {
          url: "data:image/png;base64,aGVsbG8=",
          view: "back",
          azimuth: 180
        }
      ],
      inputMode: "multi-image"
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    await expect(operationPromise).resolves.toMatchObject({
      operationId: "operation-1",
      status: "running"
    });
    expect(callCount).toBe(2);
    expect(idempotencyKeys[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  });

  it("retries operation polling after Retry-After on transient responses", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "2"
          }
        });
      }

      return new Response(
        JSON.stringify({
          operation_id: "operation-1",
          done: false,
          error: null,
          metadata: { world_id: "world-1" },
          response: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl,
      maxRetries: 1
    });

    const operationPromise = provider.getOperation("operation-1");
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(operationPromise).resolves.toMatchObject({
      operationId: "operation-1",
      status: "running",
      worldId: "world-1"
    });
    expect(callCount).toBe(2);
  });

  it("retries completed world asset fetches with exponential backoff", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "temporary" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          world: {
            id: "world-1",
            assets: {
              thumbnail_url: "https://cdn.example.com/thumb.jpg",
              imagery: {
                pano_url: "https://cdn.example.com/pano.jpg"
              }
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl,
      maxRetries: 1
    });

    const assetPromise = provider.getWorldAssets("world-1", {
      projectId: "project-1",
      sceneClusterId: "scene-1"
    });
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(assetPromise).resolves.toMatchObject({
      worldId: "world-1",
      panoUrl: "https://cdn.example.com/pano.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg"
    });
    expect(callCount).toBe(2);
  });

  it("converts project-local storage images to base64 content", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-worldlabs-provider-"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const front = await storage.putObject({
      key: "projects/project-1/space-seeds/front.png",
      body: "front-image",
      contentType: "image/png"
    });
    const back = await storage.putObject({
      key: "projects/project-1/space-seeds/back.png",
      body: "back-image",
      contentType: "image/png"
    });
    const requests: Array<{ body: unknown }> = [];
    const fetchImpl: typeof fetch = async (_url, init = {}) => {
      requests.push({
        body: init.body ? JSON.parse(String(init.body)) : null
      });
      return new Response(
        JSON.stringify({
          operation_id: "operation-1",
          done: false,
          error: null,
          metadata: { world_id: "world-1" },
          response: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl,
      storage,
      maxRetries: 0
    });

    await provider.createWorld({
      sceneCluster: createSceneCluster(),
      seedImageUrls: [],
      seedImages: [
        {
          url: front.url,
          view: "front",
          azimuth: 0
        },
        {
          url: back.url,
          view: "back",
          azimuth: 180
        }
      ],
      inputMode: "multi-image"
    });

    const prompt = (requests[0]?.body as {
      world_prompt: { multi_image_prompt: Array<{ content: unknown }> };
    }).world_prompt.multi_image_prompt;
    expect(prompt[0]?.content).toMatchObject({
      source: "data_base64",
      data_base64: Buffer.from("front-image").toString("base64"),
      extension: "png"
    });
  });

  it("rejects storage image URLs that escape the project prefix", async () => {
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl: async () => new Response("{}", { status: 200 }),
      maxRetries: 0
    });

    await expect(
      provider.createWorld({
        sceneCluster: createSceneCluster(),
        seedImageUrls: [],
        seedImages: [
          {
            url: "/api/storage/projects/project-1/space-seeds/%2e%2e/private.png",
            view: "front",
            azimuth: 0
          },
          {
            url: "/api/storage/projects/project-1/space-seeds/back.png",
            view: "back",
            azimuth: 180
          }
        ],
        inputMode: "multi-image"
      })
    ).rejects.toThrow("Storage-backed provider image URL is invalid.");
  });

  it("rejects localhost and private remote image hosts when remote URLs are enabled", async () => {
    previousAllowRemote = process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS;
    process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS = "true";

    for (const imageUrl of [
      "https://localhost./image.png",
      "https://foo.localhost/image.png",
      "https://example.local./image.png",
      "https://127.42.0.1/image.png",
      "https://10.0.0.2/image.png",
      "https://172.16.0.2/image.png",
      "https://192.168.1.2/image.png",
      "https://169.254.169.254/image.png",
      "https://[::1]/image.png",
      "https://[fe80::1]/image.png",
      "https://[fd00::1]/image.png"
    ]) {
      await expect(
        assertRemoteProviderImageUrlAllowed(imageUrl)
      ).rejects.toThrow(
        "Remote provider image URL host is not allowed."
      );
    }
  });

  it("rejects remote image hosts that resolve to private addresses", async () => {
    previousAllowRemote = process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS;
    process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS = "true";

    await expect(
      assertRemoteProviderImageUrlAllowed("https://cdn.example.com/image.png", {
        async lookupRemoteAddresses() {
          return [{ address: "169.254.169.254", family: 4 }];
        }
      })
    ).rejects.toThrow("Remote provider image URL host is not allowed.");
  });

  it("fetches completed world assets into the WorldAsset shape", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          world: {
            id: "world-1",
            assets: {
              thumbnail_url: "https://cdn.example.com/thumb.jpg",
              splats: {
                spz_urls: {
                  "100k": "https://cdn.example.com/100k.spz",
                  "500k": "https://cdn.example.com/500k.spz",
                  full_res: "https://cdn.example.com/full.spz"
                },
                semantics_metadata: {
                  ground_plane_offset: -0.12
                }
              },
              mesh: {
                collider_mesh_url: "https://cdn.example.com/collider.glb"
              },
              imagery: {
                pano_url: "https://cdn.example.com/pano.jpg"
              }
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    const provider = createWorldLabsProvider({
      apiKey: "test-key",
      fetchImpl,
      maxRetries: 0
    });

    const asset = await provider.getWorldAssets("world-1", {
      projectId: "project-1",
      sceneClusterId: "scene-1"
    });

    expect(asset).toMatchObject({
      id: "world-asset-world-1",
      projectId: "project-1",
      sceneClusterId: "scene-1",
      worldId: "world-1",
      spzUrl100k: "https://cdn.example.com/100k.spz",
      spzUrl500k: "https://cdn.example.com/500k.spz",
      spzUrlFullRes: "https://cdn.example.com/full.spz",
      colliderMeshUrl: "https://cdn.example.com/collider.glb",
      panoUrl: "https://cdn.example.com/pano.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
      groundPlaneOffset: -0.12
    });
  });
});

function createSceneCluster(): SceneCluster {
  return {
    id: "scene-1",
    projectId: "project-1",
    label: "Living room",
    sourceImageIds: ["image-1"],
    representativeImageIds: ["image-1"],
    spatialPrompt:
      "A quiet living room empty of pets, people, and all other animals.",
    seedImageUrls: [],
    worldLabsOperationId: null,
    worldId: null,
    status: "selected"
  };
}
