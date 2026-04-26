import fs from "node:fs/promises";
import path from "node:path";
import { getLocalStorageDir } from "@/lib/env";
import { signStorageKey } from "./signed-urls";
import type {
  PutObjectInput,
  StorageDriver,
  StorageObjectInfo,
  StoredObject
} from "./types";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly rootDir = getLocalStorageDir()) {}

  async putObject(input: PutObjectInput): Promise<StorageObjectInfo> {
    const absolutePath = this.resolveKey(input.key);
    const body = normalizeBody(input.body);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, body);

    return {
      key: input.key,
      absolutePath,
      url: this.getObjectUrl(input.key),
      contentType: input.contentType ?? DEFAULT_CONTENT_TYPE,
      size: body.byteLength
    };
  }

  async getObject(key: string): Promise<StoredObject> {
    const absolutePath = this.resolveKey(key);
    const body = await fs.readFile(absolutePath);

    return {
      key,
      absolutePath,
      url: this.getObjectUrl(key),
      contentType: inferContentType(key),
      size: body.byteLength,
      body
    };
  }

  async deleteObject(key: string): Promise<void> {
    const absolutePath = this.resolveKey(key);
    await fs.rm(absolutePath, { force: true });
  }

  getObjectUrl(key: string): string {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    return `/api/storage/${encodedKey}?token=${signStorageKey(key, this.rootDir)}`;
  }

  private resolveKey(key: string): string {
    if (!key || key.includes("\0") || path.isAbsolute(key)) {
      throw new Error("Storage key must be a non-empty relative path.");
    }

    if (
      key
        .split("/")
        .filter(Boolean)
        .some((segment) => segment === "." || segment === "..")
    ) {
      throw new Error("Storage key cannot contain dot segments.");
    }

    const normalizedKey = path.normalize(key);

    if (normalizedKey.startsWith("..") || path.isAbsolute(normalizedKey)) {
      throw new Error("Storage key cannot leave the storage root.");
    }

    const root = path.resolve(/*turbopackIgnore: true*/ this.rootDir);
    const absolutePath = path.resolve(root, normalizedKey);

    if (!absolutePath.startsWith(`${root}${path.sep}`) && absolutePath !== root) {
      throw new Error("Storage key cannot leave the storage root.");
    }

    return absolutePath;
  }
}

export function createLocalStorageDriver(rootDir?: string): LocalStorageDriver {
  return new LocalStorageDriver(rootDir);
}

function normalizeBody(body: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  return Buffer.from(body);
}

function inferContentType(key: string): string {
  const extension = path.extname(key).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".json":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return DEFAULT_CONTENT_TYPE;
  }
}
