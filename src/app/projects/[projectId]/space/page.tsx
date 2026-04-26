import Link from "next/link";

export default async function SpacePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <main className="space-shell">
      <section className="memory-stage" aria-label="Memory space preview">
        <div className="scene-horizon" aria-hidden="true" />
        <div className="scene-floor" aria-hidden="true" />
        <div className="pet-presence" aria-hidden="true" />

        <div className="space-status">
          <p className="eyebrow">Memory space</p>
          <h1>The room is almost ready.</h1>
        </div>
      </section>

      <form className="floating-chat" aria-label="Message input">
        <Link
          className="button button-secondary"
          href={`/projects/${projectId}/loading`}
        >
          Back
        </Link>
        <input placeholder="Say something gentle..." aria-label="Message" />
        <button className="icon-button" type="button" aria-label="Use microphone">
          Mic
        </button>
        <button className="button button-primary" type="button">
          Send
        </button>
      </form>
    </main>
  );
}
