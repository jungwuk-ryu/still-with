import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalStorageDriver } from "./local-storage";

let tmpDir: string | null = null;
let previousStorageSecret: string | undefined;
let storageSecretCaptured = false;

afterEach(async () => {
  if (storageSecretCaptured) {
    if (previousStorageSecret === undefined) {
      delete process.env.STORAGE_URL_SECRET;
    } else {
      process.env.STORAGE_URL_SECRET = previousStorageSecret;
    }

    previousStorageSecret = undefined;
    storageSecretCaptured = false;
  }

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("LocalStorageDriver", () => {
  it("stores, reads, and deletes files under the configured root", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-storage-"));
    const storage = createLocalStorageDriver(tmpDir);

    const info = await storage.putObject({
      key: "projects/demo/photo.jpg",
      body: "image-bytes",
      contentType: "image/jpeg"
    });

    expect(info.url).toMatch(
      /^\/api\/storage\/projects\/demo\/photo\.jpg\?token=[a-f0-9]{64}$/
    );

    const object = await storage.getObject("projects/demo/photo.jpg");
    expect(object.body.toString()).toBe("image-bytes");
    expect(object.contentType).toBe("image/jpeg");

    await storage.deleteObject("projects/demo/photo.jpg");
    await expect(storage.getObject("projects/demo/photo.jpg")).rejects.toThrow();
  });

  it("persists a generated signing secret for stable local storage URLs", async () => {
    captureAndClearStorageSecret();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-storage-"));
    const key = "projects/demo/photo.jpg";
    const storage = createLocalStorageDriver(tmpDir);

    const firstUrl = storage.getObjectUrl(key);
    const secretPath = path.join(tmpDir, ".storage-url-secret");
    const generatedSecret = (await fs.readFile(secretPath, "utf8")).trim();
    const secondUrl = createLocalStorageDriver(tmpDir).getObjectUrl(key);

    expect(generatedSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(secondUrl).toBe(firstUrl);
  });

  it("rejects path traversal keys", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-storage-"));
    const storage = createLocalStorageDriver(tmpDir);

    await expect(
      storage.putObject({ key: "../outside.txt", body: "nope" })
    ).rejects.toThrow("Storage key cannot contain dot segments.");
  });

  it("rejects in-root dot segment retargeting", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-storage-"));
    const storage = createLocalStorageDriver(tmpDir);

    await expect(
      storage.getObject("projects/project-a/../project-b/private.jpg")
    ).rejects.toThrow("Storage key cannot contain dot segments.");
  });
});

function captureAndClearStorageSecret(): void {
  if (!storageSecretCaptured) {
    previousStorageSecret = process.env.STORAGE_URL_SECRET;
    storageSecretCaptured = true;
  }

  delete process.env.STORAGE_URL_SECRET;
}
