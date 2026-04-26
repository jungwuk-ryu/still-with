import dns from "node:dns/promises";
import type { StorageDriver } from "@/server/storage";

export interface LoadedProviderImage {
  body: Buffer;
  contentType: string;
  filename: string;
}

export async function loadProviderImage(
  imageUrl: string,
  options: {
    projectId: string;
    storage: StorageDriver;
    fetchImpl?: typeof fetch;
    lookupRemoteAddresses?: LookupRemoteAddresses;
  }
): Promise<LoadedProviderImage> {
  const storageKey = storageKeyFromProviderImageUrl(imageUrl, options.projectId);

  if (storageKey) {
    try {
      const object = await options.storage.getObject(storageKey);
      return {
        body: object.body,
        contentType: object.contentType,
        filename: storageKey.split("/").at(-1) ?? "image.png"
      };
    } catch {
      throw new Error("Storage-backed provider image could not be read.");
    }
  }

  if (imageUrl.startsWith("data:")) {
    return parseDataUrlImage(imageUrl);
  }

  await assertRemoteProviderImageUrlAllowed(imageUrl, {
    lookupRemoteAddresses: options.lookupRemoteAddresses
  });
  const response = await (options.fetchImpl ?? fetch)(imageUrl);

  if (!response.ok) {
    throw new Error(`Remote provider image fetch failed with HTTP ${response.status}.`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    filename: "remote-image"
  };
}

export function storageKeyFromProviderImageUrl(
  imageUrl: string,
  projectId: string
): string | null {
  const storagePath = extractRawStoragePath(imageUrl);

  if (!storagePath) {
    return null;
  }

  const encodedSegments = storagePath.slice("/api/storage/".length).split("/");
  const decodedSegments = encodedSegments.map((segment) => {
    let decoded: string;

    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error("Storage-backed provider image URL is invalid.");
    }

    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      throw new Error("Storage-backed provider image URL is invalid.");
    }

    return decoded;
  });
  const storageKey = decodedSegments.join("/");
  const expectedPrefix = `projects/${projectId}/`;

  if (!storageKey.startsWith(expectedPrefix)) {
    throw new Error("Storage-backed provider image URL is outside this project.");
  }

  return storageKey;
}

function extractRawStoragePath(imageUrl: string): string | null {
  if (imageUrl.startsWith("/api/storage/")) {
    return imageUrl.split(/[?#]/, 1)[0];
  }

  const absoluteMatch = imageUrl.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+(\/api\/storage\/[^?#]*)(?:[?#].*)?$/i);

  return absoluteMatch?.[1] ?? null;
}

export type LookupRemoteAddresses = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

export async function assertRemoteProviderImageUrlAllowed(
  imageUrl: string,
  options: {
    lookupRemoteAddresses?: LookupRemoteAddresses;
  } = {}
): Promise<void> {
  if (!/^https:\/\//.test(imageUrl)) {
    throw new Error("Provider image URL must use project storage or HTTPS.");
  }

  if (process.env.ALLOW_REMOTE_PROVIDER_IMAGE_URLS !== "true") {
    throw new Error("Remote provider image URLs are disabled for privacy.");
  }

  const hostname = normalizeRemoteHostname(new URL(imageUrl).hostname);

  if (isBlockedRemoteHostname(hostname)) {
    throw new Error("Remote provider image URL host is not allowed.");
  }

  const lookupRemoteAddresses =
    options.lookupRemoteAddresses ?? defaultLookupRemoteAddresses;
  const addresses = await lookupRemoteAddresses(hostname);

  if (
    addresses.some(({ address }) =>
      isBlockedRemoteHostname(normalizeRemoteHostname(address))
    )
  ) {
    throw new Error("Remote provider image URL host is not allowed.");
  }
}

async function defaultLookupRemoteAddresses(
  hostname: string
): Promise<Array<{ address: string; family: number }>> {
  return dns.lookup(hostname, { all: true });
}

function normalizeRemoteHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function isBlockedRemoteHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  const ipv4Address = parseIpv4Address(hostname);

  if (ipv4Address) {
    return isBlockedIpv4Address(ipv4Address);
  }

  if (hostname.startsWith("::ffff:")) {
    const mappedIpv4Address = parseIpv4Address(hostname.slice("::ffff:".length));
    return mappedIpv4Address ? isBlockedIpv4Address(mappedIpv4Address) : true;
  }

  return (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd")
  );
}

function parseIpv4Address(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));

  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        octet.toString() !== parts[index]
    )
  ) {
    return null;
  }

  return octets as [number, number, number, number];
}

function isBlockedIpv4Address([first, second]: [number, number, number, number]): boolean {
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseDataUrlImage(dataUrl: string): LoadedProviderImage {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);

  if (!match) {
    throw new Error("Provider image data URL is invalid.");
  }

  return {
    body: Buffer.from(match[2], "base64"),
    contentType: match[1],
    filename: `image.${extensionFromContentType(match[1])}`
  };
}

function extensionFromContentType(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}
