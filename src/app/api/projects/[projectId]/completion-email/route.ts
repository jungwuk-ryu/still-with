import { NextResponse } from "next/server";
import {
  CompletionEmailSubscriptionError,
  subscribeToProjectCompletionEmail
} from "@/server/projects";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  try {
    const body = (await readJsonBody(request)) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const result = await subscribeToProjectCompletionEmail(projectId, email);
    const emailWasSent = result.alreadyReady && result.status === "sent";
    const emailQueued = result.alreadyReady && !emailWasSent;

    return NextResponse.json(
      {
        status: emailWasSent ? "sent" : emailQueued ? "queued" : "subscribed",
        message: emailWasSent
          ? "Your link has been emailed."
          : emailQueued
            ? "Email saved. We will send the link shortly."
          : "Email saved. We will send one quiet note when the space is ready."
      },
      { status: emailWasSent ? 200 : 202 }
    );
  } catch (error) {
    if (error instanceof CompletionEmailSubscriptionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Completion email subscription failed", error);
    return NextResponse.json(
      { error: "That email could not be saved. Please try again." },
      { status: 500 }
    );
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CompletionEmailSubscriptionError(
      "Enter a valid email address.",
      400
    );
  }
}
