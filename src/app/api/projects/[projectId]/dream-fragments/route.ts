import { NextResponse } from "next/server";
import { getDatabase } from "@/server/db";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import { ensureDreamFragmentsForSpace } from "@/server/projects/dream-fragments";
import { getPublicProjectStatus } from "@/server/projects";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const sceneClusterId = url.searchParams.get("sceneClusterId");
  const db = getDatabase();
  const status = getPublicProjectStatus(projectId, { db });

  if (!status) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!status.canEnter) {
    return NextResponse.json(
      { error: "Project space is not ready." },
      { status: 409 }
    );
  }

  if (!sceneClusterId) {
    return NextResponse.json(
      { error: "A space id is required." },
      { status: 400 }
    );
  }

  ensureGenerationWorkerStarted();
  const result = ensureDreamFragmentsForSpace(projectId, sceneClusterId, db);

  return NextResponse.json(result);
}
