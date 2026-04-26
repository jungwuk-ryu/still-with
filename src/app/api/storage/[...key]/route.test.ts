import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalStorageDriver, signStorageKey } from "@/server/storage";
import { GET } from "./route";

let tmpDir: string | null = null;
let previousStorageDir: string | undefined;
let previousStorageSecret: string | undefined;

afterEach(async () => {
  if (previousStorageDir === undefined) {
    delete process.env.LOCAL_STORAGE_DIR;
  } else {
    process.env.LOCAL_STORAGE_DIR = previousStorageDir;
  }

  if (previousStorageSecret === undefined) {
    delete process.env.STORAGE_URL_SECRET;
  } else {
    process.env.STORAGE_URL_SECRET = previousStorageSecret;
  }

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("storage route", () => {
  it("serves project storage objects only with a valid signed token", async () => {
    await setupStorageRouteTest();
    const storage = createLocalStorageDriver();
    const stored = await storage.putObject({
      key: "projects/project-a/photo.jpg",
      body: "image-bytes",
      contentType: "image/jpeg"
    });

    const response = await GET(
      new Request(`http://localhost${stored.url}`),
      {
        params: Promise.resolve({
          key: ["projects", "project-a", "photo.jpg"]
        })
      }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image-bytes");
  });

  it("rejects unsigned storage URLs", async () => {
    await setupStorageRouteTest();

    const response = await GET(
      new Request("http://localhost/api/storage/projects/project-a/photo.jpg"),
      {
        params: Promise.resolve({
          key: ["projects", "project-a", "photo.jpg"]
        })
      }
    );

    expect(response.status).toBe(404);
  });

  it("rejects dot-segment retargeting even with a matching token", async () => {
    await setupStorageRouteTest();
    const unsafeKey = "projects/project-a/../project-b/private.jpg";
    const response = await GET(
      new Request(
        `http://localhost/api/storage/projects/project-a/../project-b/private.jpg?token=${signStorageKey(unsafeKey)}`
      ),
      {
        params: Promise.resolve({
          key: ["projects", "project-a", "..", "project-b", "private.jpg"]
        })
      }
    );

    expect(response.status).toBe(404);
  });
});

async function setupStorageRouteTest(): Promise<void> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-storage-route-"));
  previousStorageDir = process.env.LOCAL_STORAGE_DIR;
  previousStorageSecret = process.env.STORAGE_URL_SECRET;
  process.env.LOCAL_STORAGE_DIR = tmpDir;
  process.env.STORAGE_URL_SECRET = "test-storage-secret";
}
