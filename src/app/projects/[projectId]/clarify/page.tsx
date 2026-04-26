import Link from "next/link";
import { redirect } from "next/navigation";
import { ClarificationForm } from "@/components/clarification/ClarificationForm";
import { getPublicProjectStatus } from "@/server/projects";

export const dynamic = "force-dynamic";

export default async function ClarifyPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const status = getPublicProjectStatus(projectId);

  if (!status) {
    return (
      <main className="app-shell app-shell-centered">
        <section className="clarify-panel" aria-labelledby="clarify-title">
          <p className="eyebrow">Not found</p>
          <h1 id="clarify-title">This memory could not be found.</h1>
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

  if (status.status !== "clarification_required") {
    redirect(getRouteForCurrentStatus(projectId, status));
  }

  return (
    <main className="app-shell app-shell-centered">
      <section className="clarify-panel" aria-labelledby="clarify-title">
        <p className="eyebrow">A little more detail</p>
        <h1 id="clarify-title">
          {status.displayName
            ? `Which photo shows ${status.displayName}?`
            : "Which one should we bring into the memory?"}
        </h1>
        <p className="panel-subtitle">
          Tell us a visual detail, like &ldquo;the small white dog with brown
          ears&rdquo; or &ldquo;the cat with the blue collar.&rdquo;
        </p>

        <ClarificationForm projectId={projectId} images={status.uploadedImages} />
      </section>
    </main>
  );
}

function getRouteForCurrentStatus(
  projectId: string,
  status: NonNullable<ReturnType<typeof getPublicProjectStatus>>
): string {
  if (status.nextRoute) {
    return status.nextRoute;
  }

  if (status.status === "failed" || status.status === "cancelled") {
    return "/";
  }

  return `/projects/${projectId}/loading`;
}
