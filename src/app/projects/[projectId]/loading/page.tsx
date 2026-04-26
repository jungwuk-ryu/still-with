import { LoadingProgress } from "@/components/loading/LoadingProgress";
import { getPublicProjectStatus, LOADING_STAGES } from "@/server/projects";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoadingPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ entry?: string | string[] }>;
}) {
  const { projectId } = await params;
  const { entry } = await searchParams;
  const isPublicEntry = entry === "public";
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

  if (isPublicEntry && (!initialStatus.isPublic || !initialStatus.canEnter)) {
    return (
      <main className="app-shell app-shell-centered">
        <section className="progress-panel" aria-labelledby="loading-title">
          <p className="eyebrow">Not public</p>
          <h1 id="loading-title">This dream is not available here.</h1>
          <p className="panel-subtitle">
            Public dreams appear after their creators choose to share them.
          </p>
          <Link className="button button-primary" href="/projects">
            View Dreams
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
        publicEntry={isPublicEntry}
      />
    </main>
  );
}
