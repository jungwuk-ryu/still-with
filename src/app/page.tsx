import Link from "next/link";
import { UploadFlow } from "@/components/upload/UploadFlow";

export default function UploadPage() {
  return (
    <main className="app-shell">
      <nav className="top-nav" aria-label="Primary">
        <Link className="brand-mark" href="/">
          Still With
        </Link>
        <span className="nav-pill">Private by design</span>
      </nav>

      <section className="upload-grid" aria-labelledby="upload-title">
        <div className="hero-copy">
          <p className="eyebrow">Memory space</p>
          <h1 id="upload-title">Create a place to remember them.</h1>
          <p className="hero-subtitle">
            Upload a few photos of your pet and the places they loved.
          </p>
        </div>

        <UploadFlow />
      </section>
    </main>
  );
}
