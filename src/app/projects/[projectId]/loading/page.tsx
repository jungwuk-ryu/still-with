import { LoadingProgress } from "@/components/loading/LoadingProgress";
import { getPublicProjectStatus, LOADING_STAGES } from "@/server/projects";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoadingPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const initialStatus = getPublicProjectStatus(projectId);

  if (!initialStatus) {
    return (
      <main className="app-shell app-shell-centered">
        <section className="progress-panel" aria-labelledby="loading-title">
          <p className="eyebrow">Not found</p>
          <h1 id="loading-title">This memory could not be found.</h1>
          <p className="panel-subtitle">
            Begin again with the photos you want to hold in focus.
          </p>
          <Link className="button button-primary" href="/">
            Start again
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell-centered">
      <LoadingProgress
        projectId={projectId}
        initialStatus={initialStatus}
        stageTitles={LOADING_STAGES.map((stage) => stage.title)}
      />
    </main>
  );
}
