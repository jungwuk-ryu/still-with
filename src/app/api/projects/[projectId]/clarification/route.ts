import { NextResponse } from "next/server";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import {
  ClarificationValidationError,
  getPublicProjectStatus,
  submitProjectClarification
} from "@/server/projects";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json()) as { visualDetail?: unknown };
    const visualDetail =
      typeof body.visualDetail === "string" ? body.visualDetail : "";

    submitProjectClarification(projectId, visualDetail);
    ensureGenerationWorkerStarted();

    const status = getPublicProjectStatus(projectId);

    return NextResponse.json({
      status,
      nextUrl: `/projects/${projectId}/loading`
    });
  } catch (error) {
    if (error instanceof ClarificationValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Project clarification failed", error);
    return NextResponse.json(
      { error: "That detail could not be saved. Please try again." },
      { status: 500 }
    );
  }
}
