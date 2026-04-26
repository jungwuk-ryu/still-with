import { NextResponse } from "next/server";
import {
  createLocalStorageDriver,
  verifyStorageKeySignature
} from "@/server/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key } = await context.params;
  const storageKey = key.join("/");
  const storage = createLocalStorageDriver();
  const token = new URL(request.url).searchParams.get("token");

  if (!isAllowedStorageKey(storageKey) || !verifyStorageKeySignature(storageKey, token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const object = await storage.getObject(storageKey);
    const responseBody = object.body.buffer.slice(
      object.body.byteOffset,
      object.body.byteOffset + object.body.byteLength
    ) as ArrayBuffer;

    return new NextResponse(responseBody, {
      headers: {
        "Content-Length": object.size.toString(),
        "Content-Type": object.contentType,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

function isAllowedStorageKey(storageKey: string): boolean {
  const segments = storageKey.split("/");

  return (
    segments.length >= 3 &&
    segments[0] === "projects" &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\")
    )
  );
}
