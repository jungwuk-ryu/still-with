"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPTED_FORMATS = ".jpg,.jpeg,.png,.webp,.heic,.heif";
const MAX_IMAGE_COUNT = 12;
const MIN_RECOMMENDED_IMAGE_COUNT = 3;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

const ACCEPTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif"
]);

interface SelectedPhoto {
  id: string;
  file: File;
  previewUrl: string | null;
}

interface UploadResponse {
  error?: string;
  nextUrl?: string;
}

export function UploadFlow() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [petName, setPetName] = useState("");
  const [isPublicDream, setIsPublicDream] = useState(false);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) {
        if (photo.previewUrl) {
          URL.revokeObjectURL(photo.previewUrl);
        }
      }
    };
  }, []);

  const warning = useMemo(() => {
    if (photos.length > 0 && photos.length < MIN_RECOMMENDED_IMAGE_COUNT) {
      return "One or two photos can work, but a few more may help the space feel closer.";
    }

    return null;
  }, [photos.length]);

  function appendFiles(files: FileList | File[]) {
    setError(null);

    const incomingFiles = Array.from(files);
    const nextPhotos: SelectedPhoto[] = [];

    if (photos.length + incomingFiles.length > MAX_IMAGE_COUNT) {
      setError(`Choose up to ${MAX_IMAGE_COUNT} photos for this first version.`);
      return;
    }

    for (const file of incomingFiles) {
      const validationError = validatePhoto(file);

      if (validationError) {
        setError(validationError);
        continue;
      }

      nextPhotos.push({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: canPreviewImage(file) ? URL.createObjectURL(file) : null
      });
    }

    if (nextPhotos.length > 0) {
      setPhotos((currentPhotos) => [...currentPhotos, ...nextPhotos]);
    }
  }

  function removePhoto(photoId: string) {
    setPhotos((currentPhotos) => {
      const removed = currentPhotos.find((photo) => photo.id === photoId);

      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return currentPhotos.filter((photo) => photo.id !== photoId);
    });
  }

  async function submitPhotos() {
    const normalizedPetName = petName.trim().replace(/\s+/g, " ");

    if (!normalizedPetName) {
      setError("Add your pet's name to begin.");
      return;
    }

    if (photos.length === 0) {
      setError("Choose at least one photo to begin.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("petName", normalizedPetName);

    if (isPublicDream) {
      formData.append("isPublic", "on");
    }

    for (const photo of photos) {
      formData.append("photos", photo.file);
    }

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        body: formData
      });
      const body = (await response.json()) as UploadResponse;

      if (!response.ok) {
        setError(body.error ?? "The photos could not be prepared. Please try again.");
        setIsSubmitting(false);
        return;
      }

      if (!body.nextUrl) {
        setError("The next step could not be opened. Please try again.");
        setIsSubmitting(false);
        return;
      }

      router.push(body.nextUrl);
    } catch {
      setError("The photos could not be prepared. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className={
        photos.length > 0
          ? "upload-panel upload-panel-has-photos"
          : "upload-panel"
      }
      onSubmit={(event) => {
        event.preventDefault();
        void submitPhotos();
      }}
    >
      <section className="dream-settings" aria-labelledby="dream-settings-title">
        <div>
          <p className="eyebrow" id="dream-settings-title">
            Dream settings
          </p>
          <label className="field-label" htmlFor="pet-name">
            Pet name
          </label>
          <input
            id="pet-name"
            className="text-input"
            name="petName"
            type="text"
            autoComplete="off"
            maxLength={80}
            placeholder="Mochi"
            value={petName}
            disabled={isSubmitting}
            onChange={(event) => {
              setPetName(event.target.value);
              setError(null);
            }}
          />
        </div>

        <label className="toggle-row">
          <input
            type="checkbox"
            name="isPublic"
            checked={isPublicDream}
            disabled={isSubmitting}
            onChange={(event) => setIsPublicDream(event.target.checked)}
          />
          <span>
            <strong>Show this dream in public Dreams</strong>
            <small>Only after it is ready.</small>
          </span>
        </label>
      </section>

      <label
        className={isDragging ? "drop-zone drop-zone-active" : "drop-zone"}
        htmlFor="photo-upload"
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          appendFiles(event.dataTransfer.files);
        }}
      >
        <span className="drop-zone-title">Choose photos</span>
        <span className="drop-zone-copy">
          Drag photos here or browse from your device.
        </span>
        <span className="drop-zone-meta">
          JPG, PNG, WEBP, and HEIC. Up to {MAX_IMAGE_COUNT} photos.
        </span>
        <input
          ref={inputRef}
          id="photo-upload"
          name="photos"
          type="file"
          accept={ACCEPTED_FORMATS}
          multiple
          onChange={(event) => {
            appendFiles(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {photos.length > 0 ? (
        <div className="preview-section" aria-label="Selected photos">
          <div className="preview-section-header">
            <span>{photos.length} selected</span>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                for (const photo of photos) {
                  if (photo.previewUrl) {
                    URL.revokeObjectURL(photo.previewUrl);
                  }
                }

                setPhotos([]);
              }}
            >
              Remove all
            </button>
          </div>

          <ul className="preview-grid">
            {photos.map((photo) => (
              <li className="preview-tile" key={photo.id}>
                {photo.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.previewUrl}
                    alt={`Selected photo ${photo.file.name}`}
                  />
                ) : (
                  <div className="preview-fallback">HEIC</div>
                )}
                <div className="preview-meta">
                  <span>{photo.file.name}</span>
                  <span>{formatBytes(photo.file.size)}</span>
                </div>
                <button
                  className="preview-remove"
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="upload-actions">
        <div className="upload-notes">
          <p className="privacy-line">
            Your photos stay private unless you choose to share the finished dream.
          </p>
          {warning ? <p className="form-warning">{warning}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <button
          className="button button-primary"
          type="submit"
          disabled={photos.length === 0 || petName.trim().length === 0 || isSubmitting}
        >
          {isSubmitting ? "Preparing..." : "Begin"}
        </button>
      </div>
    </form>
  );
}

function validatePhoto(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return "Each photo needs to be 15 MB or smaller.";
  }

  if (!isAcceptedFile(file)) {
    return "Only JPG, PNG, WEBP, and HEIC images can be uploaded.";
  }

  return null;
}

function isAcceptedFile(file: File): boolean {
  const type = file.type.toLowerCase();

  if (ACCEPTED_MIME_TYPES.has(type)) {
    return true;
  }

  return ACCEPTED_EXTENSIONS.has(getFileExtension(file.name));
}

function canPreviewImage(file: File): boolean {
  const extension = getFileExtension(file.name);
  return (
    file.type !== "image/heic" &&
    file.type !== "image/heif" &&
    extension !== ".heic" &&
    extension !== ".heif"
  );
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
