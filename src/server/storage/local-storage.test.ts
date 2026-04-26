import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalStorageDriver } from "./local-storage";

let tmpDir: string | null = null;

afterEach(async () => {
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

    expect(info.url).toBe("/api/storage/projects/demo/photo.jpg");

    const object = await storage.getObject("projects/demo/photo.jpg");
    expect(object.body.toString()).toBe("image-bytes");
    expect(object.contentType).toBe("image/jpeg");

    await storage.deleteObject("projects/demo/photo.jpg");
    await expect(storage.getObject("projects/demo/photo.jpg")).rejects.toThrow();
  });

  it("rejects path traversal keys", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-storage-"));
    const storage = createLocalStorageDriver(tmpDir);

    await expect(
      storage.putObject({ key: "../outside.txt", body: "nope" })
    ).rejects.toThrow("Storage key cannot leave the storage root.");
  });
});
