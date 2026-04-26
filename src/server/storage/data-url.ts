import type { StorageDriver } from "./types";

export async function resolveProviderImageUrl(
  imageUrl: string,
  storage: StorageDriver
): Promise<string> {
  if (/^(https?:|data:image\/)/.test(imageUrl)) {
    return imageUrl;
  }

  const storageKey = parseStorageApiUrl(imageUrl);
  if (!storageKey) {
    return imageUrl;
  }

  const object = await storage.getObject(storageKey);
  return `data:${object.contentType};base64,${object.body.toString("base64")}`;
}

export async function resolveProviderImageUrls(
  imageUrls: readonly string[],
  storage: StorageDriver
): Promise<string[]> {
  return Promise.all(
    imageUrls.map((imageUrl) => resolveProviderImageUrl(imageUrl, storage))
  );
}

function parseStorageApiUrl(imageUrl: string): string | null {
  if (!imageUrl.startsWith("/api/storage/")) {
    return null;
  }

  return imageUrl
    .slice("/api/storage/".length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}
