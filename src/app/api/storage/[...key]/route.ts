import { NextResponse } from "next/server";
import { createLocalStorageDriver } from "@/server/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key } = await context.params;
  const storageKey = key.join("/");
  const storage = createLocalStorageDriver();

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
