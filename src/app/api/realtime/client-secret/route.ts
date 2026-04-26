import { NextResponse } from "next/server";
import { MissingEnvironmentVariableError } from "@/lib/env/server";
import { getProjectRecord } from "@/server/db/projects";
import { checkRealtimeRateLimit } from "@/server/realtime/rate-limit";
import { createRealtimeClientSecret } from "@/server/realtime/client-secret";
import {
  consumeSpaceAccessToken,
  createSpaceAccessToken,
  hasSpaceAccessToken
} from "@/server/realtime/space-access";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { projectId?: unknown }
    | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const accessToken = request.headers.get("x-still-with-space-token") ?? "";

  if (!projectId) {
    return NextResponse.json(
      { error: "Voice needs a memory space before it can start." },
      { status: 400 }
    );
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Voice can only start from this memory space." },
      { status: 403 }
    );
  }

  const project = getProjectRecord(projectId);

  if (!project) {
    return NextResponse.json(
      { error: "Voice is unavailable for this memory space." },
      { status: 404 }
    );
  }

  if (project.status !== "ready") {
    return NextResponse.json(
      { error: "Voice can start once this memory space is ready." },
      { status: 409 }
    );
  }

  if (!hasSpaceAccessToken(projectId, accessToken)) {
    return NextResponse.json(
      { error: "Voice needs a fresh memory space session." },
      { status: 403 }
    );
  }

  const rateLimit = checkRealtimeRateLimit(
    `${getClientIp(request)}:${projectId}`
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Voice is taking a short rest. Please try again soon." },
      {
        status: 429,
        headers: {
          "Retry-After": rateLimit.retryAfterSeconds.toString()
        }
      }
    );
  }

  try {
    const secret = await createRealtimeClientSecret();

    if (!consumeSpaceAccessToken(projectId, accessToken)) {
      return NextResponse.json(
        { error: "Voice needs a fresh memory space session." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      clientSecret: secret.value,
      expiresAt: secret.expiresAt,
      model: secret.model,
      nextRealtimeAccessToken: createSpaceAccessToken(projectId)
    });
  } catch (error) {
    if (error instanceof MissingEnvironmentVariableError) {
      return NextResponse.json(
        {
          error:
            "Voice is unavailable because the realtime connection is not configured."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Voice is unavailable right now." },
      { status: 502 }
    );
  }
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return process.env.NODE_ENV !== "production";
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
