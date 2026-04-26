import { NextResponse } from "next/server";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import { getPublicProjectStatus } from "@/server/projects";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  ensureGenerationWorkerStarted();
  const status = getPublicProjectStatus(projectId);

  if (!status) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json(status);
}
