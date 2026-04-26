import { NextResponse } from "next/server";
import { getExperienceAudioManifest } from "@/server/conversation/experience-manifest";
import { getDatabase } from "@/server/db";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import {
  ensureExperienceAudioBackfill,
  type ExperienceAudioBackfillStatus
} from "@/server/projects/pipeline";
import { getPublicProjectStatus } from "@/server/projects";
import type { ExperienceAudioManifest } from "@/server/conversation/types";

export const runtime = "nodejs";

export interface ProjectAudioResponse {
  audio: ExperienceAudioManifest;
  audioStatus: ExperienceAudioBackfillStatus;
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

  ensureGenerationWorkerStarted();
  const audioStatus = ensureExperienceAudioBackfill(projectId, db, {
    sceneClusterId
  });
  const audio = getExperienceAudioManifest(projectId, db, sceneClusterId);

  return NextResponse.json({
    audio,
    audioStatus
  } satisfies ProjectAudioResponse);
}
