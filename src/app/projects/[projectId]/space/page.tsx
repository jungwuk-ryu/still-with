import { MemorySpaceClient } from "@/components/space/MemorySpaceClient";
import { getExperienceManifest } from "@/server/conversation/experience-manifest";
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

  const manifest = getExperienceManifest(projectId);

  return <MemorySpaceClient manifest={manifest} />;
}
