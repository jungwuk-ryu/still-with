import { MemorySpaceClient } from "@/components/space/MemorySpaceClient";
import { getExperienceManifest } from "@/server/conversation/experience-manifest";

export const dynamic = "force-dynamic";

export default async function SpacePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const manifest = getExperienceManifest(projectId);

  return <MemorySpaceClient manifest={manifest} />;
}
