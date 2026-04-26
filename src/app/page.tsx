import Link from "next/link";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { BrandMark } from "@/components/brand/BrandMark";

export default function UploadPage() {
  return (
    <main className="app-shell">
      <nav className="top-nav" aria-label="Primary">
        <BrandMark />
        <div className="nav-actions">
          <Link className="nav-pill" href="/projects">
            Dreams
          </Link>
          <span className="nav-pill">Private by default</span>
        </div>
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
