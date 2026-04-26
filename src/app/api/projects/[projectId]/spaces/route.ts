import { NextResponse } from "next/server";
import { getExperienceManifest } from "@/server/conversation/experience-manifest";
import type { ExperienceSpaceSummary } from "@/server/conversation/types";
import { getDatabase } from "@/server/db";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import { ensureBackgroundSpaceGeneration } from "@/server/projects/pipeline";
import { getPublicProjectStatus } from "@/server/projects";

export const runtime = "nodejs";

export interface ProjectSpacesResponse {
  spaces: ExperienceSpaceSummary[];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const activeSceneClusterId = url.searchParams.get("activeSceneClusterId");
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

  ensureGenerationWorkerStarted();
  ensureBackgroundSpaceGeneration(projectId, db);

  const manifest = getExperienceManifest(projectId, db, {
    issueAccessTokens: false,
    sceneClusterId: activeSceneClusterId
  });

  return NextResponse.json({
    spaces: manifest.spaces
  } satisfies ProjectSpacesResponse);
}
