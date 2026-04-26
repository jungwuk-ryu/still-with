import { MemorySpaceClient } from "@/components/space/MemorySpaceClient";
import { getExperienceManifest } from "@/server/conversation/experience-manifest";
import { ensureGenerationWorkerStarted } from "@/server/jobs/runtime";
import { ensureExperienceAudioBackfill } from "@/server/projects/pipeline";
import { getPublicProjectStatus } from "@/server/projects";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SpacePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const status = getPublicProjectStatus(projectId);

  if (!status) {
    notFound();
  }

  if (!status.canEnter) {
    redirect(status.nextRoute ?? `/projects/${projectId}/loading`);
  }

  ensureGenerationWorkerStarted();
  const manifest = getExperienceManifest(projectId);
  ensureExperienceAudioBackfill(projectId, undefined, {
    sceneClusterId: manifest.world.sceneClusterId
  });

  return <MemorySpaceClient manifest={manifest} />;
}
