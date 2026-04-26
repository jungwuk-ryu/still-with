import Link from "next/link";

export default async function ClarifyPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <main className="app-shell app-shell-centered">
      <section className="clarify-panel" aria-labelledby="clarify-title">
        <p className="eyebrow">A little more detail</p>
        <h1 id="clarify-title">Which one should we bring into the memory?</h1>
        <p className="panel-subtitle">
          Tell us a visual detail, like &ldquo;the small white dog with brown
          ears&rdquo; or &ldquo;the cat with the blue collar.&rdquo;
        </p>

        <form className="clarify-form">
          <label htmlFor="clarification">Visual detail</label>
          <textarea
            id="clarification"
            name="clarification"
            placeholder="The small white dog with brown ears"
            rows={4}
          />
          <Link
            className="button button-primary"
            href={`/projects/${projectId}/loading`}
          >
            Continue
          </Link>
        </form>
      </section>
    </main>
  );
}
