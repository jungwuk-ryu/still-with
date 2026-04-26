import { NextResponse } from "next/server";
import { createConversationTurn } from "@/server/conversation/chat";
import { getProjectRecord } from "@/server/db/projects";
import { checkRealtimeRateLimit } from "@/server/realtime/rate-limit";
import {
  consumeSpaceAccessToken,
  createSpaceAccessToken,
  hasSpaceAccessToken
} from "@/server/realtime/space-access";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { message?: unknown }
    | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const accessToken = request.headers.get("x-still-with-chat-token") ?? "";

  if (!message) {
    return NextResponse.json(
      { error: "Please enter a message." },
      { status: 400 }
    );
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Messages can only be sent from this memory space." },
      { status: 403 }
    );
  }

  const project = getProjectRecord(projectId);

  if (!project) {
    return NextResponse.json(
      { error: "Messages are unavailable for this memory space." },
      { status: 404 }
    );
  }

  if (project.status !== "ready") {
    return NextResponse.json(
      { error: "Messages can start once this memory space is ready." },
      { status: 409 }
    );
  }

  if (!hasSpaceAccessToken(projectId, accessToken)) {
    return NextResponse.json(
      { error: "Please refresh this memory space before sending another message." },
      { status: 403 }
    );
  }

  const rateLimit = checkRealtimeRateLimit(
    `chat:${getClientIp(request)}:${projectId}`
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Messages are taking a short rest. Please try again soon." },
      {
        status: 429,
        headers: {
          "Retry-After": rateLimit.retryAfterSeconds.toString()
        }
      }
    );
  }

  if (!consumeSpaceAccessToken(projectId, accessToken)) {
    return NextResponse.json(
      { error: "Please refresh this memory space before sending another message." },
      { status: 403 }
    );
  }

  const result = await createConversationTurn(projectId, message);

  return NextResponse.json({
    ...result,
    nextChatAccessToken: createSpaceAccessToken(projectId)
  });
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
