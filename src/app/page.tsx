import Link from "next/link";

const acceptedFormats = ".jpg, .jpeg, .png, .webp, .heic";

export default function UploadPage() {
  return (
    <main className="app-shell">
      <nav className="top-nav" aria-label="Primary">
        <Link className="brand-mark" href="/">
          Still With
        </Link>
        <Link className="nav-pill" href="/projects/demo/loading">
          Preview
        </Link>
      </nav>

      <section className="upload-grid" aria-labelledby="upload-title">
        <div className="hero-copy">
          <p className="eyebrow">Memory space</p>
          <h1 id="upload-title">Create a place to remember them.</h1>
          <p className="hero-subtitle">
            Upload a few photos of your pet and the places they loved.
          </p>
        </div>

        <form className="upload-panel">
          <label className="drop-zone" htmlFor="photo-upload">
            <span className="drop-zone-title">Choose photos</span>
            <span className="drop-zone-copy">
              More photos help us recognize your pet and rebuild the space more
              faithfully.
            </span>
            <input
              id="photo-upload"
              name="photos"
              type="file"
              accept={acceptedFormats}
              multiple
            />
          </label>

          <div className="upload-actions">
            <p className="privacy-line">
              Your photos stay private while this memory is prepared.
            </p>
            <button className="button button-primary" type="button">
              Begin
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
