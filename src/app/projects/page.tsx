import Link from "next/link";
import { listPublicDreams } from "@/server/projects";
import { BrandMark } from "@/components/brand/BrandMark";

export const dynamic = "force-dynamic";

export default function PublicDreamsPage() {
  const dreams = listPublicDreams();

  return (
    <main className="app-shell">
      <nav className="top-nav" aria-label="Primary">
        <BrandMark />
        <Link className="nav-pill" href="/">
          Create a dream
        </Link>
      </nav>

      <section className="public-dreams" aria-labelledby="public-dreams-title">
        <div className="public-dreams-header">
          <p className="eyebrow">Public Dreams</p>
          <h1 id="public-dreams-title">Step softly into shared memories.</h1>
          <p className="hero-subtitle">
            These dreams were shared by their creators. Each one opens through a
            short quiet preload before the room appears.
          </p>
        </div>

        {dreams.length > 0 ? (
          <ul className="public-dream-grid">
            {dreams.map((dream) => (
              <li key={dream.projectId}>
                <Link className="public-dream-card" href={dream.href}>
                  <span className="public-dream-image" aria-hidden="true">
                    {dream.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dream.thumbnailUrl} alt="" loading="lazy" />
                    ) : null}
                  </span>
                  <span className="public-dream-card-copy">
                    <strong>{dream.title}</strong>
                    <small>Preview the dream</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-public-dreams">
            <h2>No public dreams yet.</h2>
            <p>Shared dreams will appear here after they finish preparing.</p>
            <Link className="button button-primary" href="/">
              Create a dream
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
