import { NextResponse } from "next/server";
import { getExperienceManifest } from "@/server/conversation/experience-manifest";
import type { ExperienceManifest } from "@/server/conversation/types";
import { getDatabase } from "@/server/db";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import {
  ensureBackgroundSpaceGeneration,
  ensureExperienceAudioBackfill
} from "@/server/projects/pipeline";
import { getPublicProjectStatus } from "@/server/projects";

export const runtime = "nodejs";

export interface ProjectSpaceManifestResponse {
  manifest: ExperienceManifest;
}

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
  const manifest = getExperienceManifest(projectId, db, { sceneClusterId });

  if (manifest.world.sceneClusterId !== sceneClusterId || !manifest.world.asset) {
    return NextResponse.json(
      { error: "This memory space is still being prepared." },
      { status: 409 }
    );
  }

  ensureExperienceAudioBackfill(projectId, db, { sceneClusterId });
  ensureBackgroundSpaceGeneration(projectId, db);

  return NextResponse.json({
    manifest
  } satisfies ProjectSpaceManifestResponse);
}
