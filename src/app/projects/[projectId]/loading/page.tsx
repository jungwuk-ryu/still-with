import Link from "next/link";

const stages = [
  "Looking through your memories",
  "Finding what feels familiar",
  "Remembering the light",
  "Making the space feel calm",
  "Preparing a gentle presence",
  "Checking the feeling",
  "Ready when you are"
];

export default async function LoadingPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const currentStepIndex = 2;

  return (
    <main className="app-shell app-shell-centered">
      <section className="progress-panel" aria-labelledby="loading-title">
        <div className="ambient-memory" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <p className="eyebrow">Step {currentStepIndex + 1} of 7</p>
        <h1 id="loading-title">A quiet place is being prepared</h1>
        <p className="panel-subtitle">
          We&apos;re taking a little time to make this feel gentle, familiar, and
          safe.
        </p>

        <ol className="stage-list" aria-label="Preparation stages">
          {stages.map((stage, index) => (
            <li
              className={index === currentStepIndex ? "stage-active" : ""}
              key={stage}
            >
              <span>{stage}</span>
            </li>
          ))}
        </ol>

        <Link className="button button-secondary" href={`/projects/${projectId}/space`}>
          Enter when ready
        </Link>
      </section>
    </main>
  );
}
