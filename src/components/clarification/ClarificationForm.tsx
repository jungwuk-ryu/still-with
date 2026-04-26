"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClarificationImage {
  id: string;
  originalUrl: string;
  thumbnailUrl: string | null;
}

interface ClarificationFormProps {
  projectId: string;
  images: ClarificationImage[];
}

interface ClarificationResponse {
  error?: string;
  nextUrl?: string;
}

export function ClarificationForm({ projectId, images }: ClarificationFormProps) {
  const router = useRouter();
  const [visualDetail, setVisualDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitClarification() {
    setError(null);

    if (visualDetail.trim().length < 3) {
      setError("Share one visual detail so we know who to hold in focus.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/clarification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ visualDetail })
      });
      const body = (await response.json()) as ClarificationResponse;

      if (!response.ok) {
        setError(body.error ?? "That detail could not be saved. Please try again.");
        setIsSubmitting(false);
        return;
      }

      router.push(body.nextUrl ?? `/projects/${projectId}/loading`);
    } catch {
      setError("That detail could not be saved. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="clarify-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submitClarification();
      }}
    >
      {images.length > 0 ? (
        <ul className="clarify-image-strip" aria-label="Uploaded photos">
          {images.map((image) => (
            <li key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.thumbnailUrl ?? image.originalUrl} alt="" />
            </li>
          ))}
        </ul>
      ) : null}

      <label htmlFor="clarification">Visual detail</label>
      <textarea
        id="clarification"
        name="clarification"
        placeholder="The small white dog with brown ears"
        rows={4}
        value={visualDetail}
        onChange={(event) => setVisualDetail(event.currentTarget.value)}
      />

      {error ? <p className="form-error">{error}</p> : null}

      <button
        className="button button-primary"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
