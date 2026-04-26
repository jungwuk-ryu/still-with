"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@/types";

interface PublicProjectImage {
  id: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  mimeType: string;
  uploadOrder: number;
}

interface PublicLoadingStage {
  index: number;
  total: number;
  label: string;
  title: string;
  description: string;
}

interface GentleRetryState {
  message: string;
  retryAfterSeconds: number | null;
}

interface PublicProjectError {
  code: string | null;
  message: string;
}

interface PublicSpacePreviewImage {
  id: string;
  url: string;
  label: string;
  order: number;
}

interface PublicProjectStatus {
  projectId: string;
  status: ProjectStatus;
  stage: PublicLoadingStage;
  retry: GentleRetryState | null;
  error: PublicProjectError | null;
  nextRoute: string | null;
  canEnter: boolean;
  needsClarification: boolean;
  uploadedImages: PublicProjectImage[];
  spacePreviewImages: PublicSpacePreviewImage[];
  selectedPetId: string | null;
  hasCompletionEmailSubscription: boolean;
  updatedAt: string;
}

interface LoadingProgressProps {
  projectId: string;
  initialStatus: PublicProjectStatus | null;
  stageTitles: string[];
}

export function LoadingProgress({
  projectId,
  initialStatus,
  stageTitles
}: LoadingProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PublicProjectStatus | null>(initialStatus);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isMissingProject, setIsMissingProject] = useState(initialStatus === null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [hasEmailSubscription, setHasEmailSubscription] = useState(
    initialStatus?.hasCompletionEmailSubscription ?? false
  );
  const emailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const emailDialogRef = useRef<HTMLElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isActive = true;

    async function refreshStatus() {
      try {
        const response = await fetch(`/api/projects/${projectId}/status`, {
          cache: "no-store"
        });

        if (response.status === 404) {
          if (isActive) {
            setIsMissingProject(true);
            setRefreshError(null);
          }

          return;
        }

        if (!response.ok) {
          throw new Error("Unable to refresh progress.");
        }

        const nextStatus = (await response.json()) as PublicProjectStatus;

        if (isActive) {
          setStatus(nextStatus);
          setHasEmailSubscription(nextStatus.hasCompletionEmailSubscription);
          setIsMissingProject(false);
          setRefreshError(null);
        }
      } catch {
        if (isActive) {
          setRefreshError("We could not refresh the progress just now. We'll keep trying.");
        }
      }
    }

    void refreshStatus();
    const intervalId = window.setInterval(refreshStatus, 2_500);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [projectId]);

  useEffect(() => {
    if (!status?.needsClarification || !status.nextRoute) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      router.push(status.nextRoute ?? `/projects/${projectId}/clarify`);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [projectId, router, status?.needsClarification, status?.nextRoute]);

  useEffect(() => {
    if (!isEmailDialogOpen) {
      return;
    }

    const emailTrigger = emailTriggerRef.current;
    emailInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEmailDialogOpen(false);
        return;
      }

      if (event.key !== "Tab" || !emailDialogRef.current) {
        return;
      }

      const focusableElements = emailDialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      emailTrigger?.focus();
    };
  }, [isEmailDialogOpen]);

  const activeIndex = status?.stage.index ?? 0;
  const visibleStatus = useMemo(() => {
    if (status) {
      return status;
    }

    return {
      stage: {
        index: 0,
        total: stageTitles.length,
        label: `Step 1 of ${stageTitles.length}`,
        title: stageTitles[0] ?? "Waking the memory",
        description:
          "Finding the moments, colors, and places that appear in your photos."
      },
      retry: null,
      error: null,
      canEnter: false,
      nextRoute: null,
      spacePreviewImages: [],
      hasCompletionEmailSubscription: hasEmailSubscription,
      status: "uploading" as ProjectStatus
    };
  }, [hasEmailSubscription, stageTitles, status]);
  const previewBackgroundImages = visibleStatus.spacePreviewImages.slice(0, 2);
  const emailFeedbackId = "completion-email-feedback";
  const emailErrorId = "completion-email-error";
  const emailDescriptionId = "completion-email-description";
  const emailDescribedBy = [
    emailDescriptionId,
    emailFeedback ? emailFeedbackId : null,
    emailError ? emailErrorId : null
  ]
    .filter(Boolean)
    .join(" ");

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingEmail(true);
    setEmailError(null);
    setEmailFeedback(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/completion-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "That email could not be saved.");
      }

      setHasEmailSubscription(true);
      setEmailFeedback(
        body.message ??
          "Email saved. We will send one quiet note when the space is ready."
      );
    } catch (error) {
      setEmailError(
        error instanceof Error
          ? error.message
          : "That email could not be saved. Please try again."
      );
    } finally {
      setIsSubmittingEmail(false);
    }
  }

  if (isMissingProject) {
    return (
      <section className="progress-panel" aria-labelledby="loading-title">
        <p className="eyebrow">Not found</p>
        <h1 id="loading-title">This memory could not be found.</h1>
        <p className="panel-subtitle">
          Begin again with the photos you want to hold in focus.
        </p>
        <Link className="button button-primary" href="/">
          Start again
        </Link>
      </section>
    );
  }

  if (visibleStatus.status === "failed") {
    return (
      <section className="progress-panel" aria-labelledby="loading-title">
        <p className="eyebrow">Generation failed</p>
        <h1 id="loading-title">This memory could not be generated.</h1>
        <p className="panel-subtitle">
          {visibleStatus.error?.message ??
            "Something went wrong while preparing it."} You can begin again
          with the photos you want to use.
        </p>
        <Link className="button button-secondary" href="/">
          Start again
        </Link>
      </section>
    );
  }

  return (
    <>
      {previewBackgroundImages.length > 0 ? (
        <div className="space-preview-background" aria-hidden="true">
          {previewBackgroundImages.map((preview) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={preview.id}
              src={preview.url}
              alt=""
              loading="eager"
              draggable={false}
            />
          ))}
        </div>
      ) : null}

      <section
        className="progress-panel"
        aria-labelledby="loading-title"
        aria-hidden={isEmailDialogOpen ? "true" : undefined}
      >
        <p className="eyebrow">{visibleStatus.stage.label}</p>
        <h1 id="loading-title">Waking a quiet memory</h1>
        <p className="panel-subtitle">
          A familiar room is slowly taking shape, like stepping into a soft
          dream.
        </p>

        <div className="current-stage" role="status" aria-live="polite" aria-atomic="true">
          <span>{visibleStatus.stage.title}</span>
          <p>{visibleStatus.stage.description}</p>
        </div>

        <ol className="stage-list" aria-label="Preparation stages">
          {stageTitles.map((stage, index) => (
            <li
              className={getStageClassName(index, activeIndex)}
              key={`${stage}-${index}`}
            >
              <span>{stage}</span>
            </li>
          ))}
        </ol>

        {!visibleStatus.canEnter ? (
          <div className="completion-email-cta">
            <button
              ref={emailTriggerRef}
              type="button"
              className="completion-email-trigger"
              onClick={() => {
                setEmailError(null);
                setEmailFeedback(
                  hasEmailSubscription
                    ? "Email reminder saved. You can update the address here."
                    : null
                );
                setIsEmailDialogOpen(true);
              }}
            >
              <span className="completion-email-orb" aria-hidden="true" />
              <span>
                {hasEmailSubscription
                  ? "Email reminder saved"
                  : "Get an email when the space is ready"}
              </span>
            </button>
            <p>
              You can step away. We will send one quiet note when the door opens.
            </p>
          </div>
        ) : null}

        {visibleStatus.retry ? (
          <p className="retry-note">{visibleStatus.retry.message}</p>
        ) : null}
        {refreshError ? <p className="form-warning">{refreshError}</p> : null}

        {visibleStatus.canEnter && visibleStatus.nextRoute ? (
          <Link className="button button-primary" href={visibleStatus.nextRoute}>
            Enter the space
          </Link>
        ) : (
          <div className="quiet-waiting" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </section>

      {isEmailDialogOpen ? (
        <div
          className="completion-email-backdrop"
          role="presentation"
          onMouseDown={() => setIsEmailDialogOpen(false)}
        >
          <section
            ref={emailDialogRef}
            className="completion-email-dialog"
            aria-labelledby="completion-email-title"
            aria-describedby={emailDescriptionId}
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="completion-email-close"
              onClick={() => setIsEmailDialogOpen(false)}
            >
              Close
            </button>
            <p className="eyebrow">Quiet notification</p>
            <h2 id="completion-email-title">
              We can email you when the space is ready.
            </h2>
            <p id={emailDescriptionId} className="completion-email-copy">
              Leave an address and we will send one gentle note with the link.
              No technical details, no extra updates.
            </p>
            <form className="completion-email-form" onSubmit={handleEmailSubmit}>
              <label htmlFor="completion-email-input">Email address</label>
              <input
                id="completion-email-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                value={email}
                disabled={isSubmittingEmail}
                ref={emailInputRef}
                aria-invalid={emailError ? "true" : undefined}
                aria-describedby={emailDescribedBy}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmittingEmail}
              >
                {isSubmittingEmail ? "Saving..." : "Notify me"}
              </button>
            </form>
            {emailFeedback ? (
              <p
                id={emailFeedbackId}
                className="completion-email-success"
                aria-live="polite"
              >
                {emailFeedback}
              </p>
            ) : null}
            {emailError ? (
              <p id={emailErrorId} className="form-error" aria-live="polite">
                {emailError}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function getStageClassName(index: number, activeIndex: number): string {
  if (index === activeIndex) {
    return "stage-active";
  }

  if (index < activeIndex) {
    return "stage-complete";
  }

  return "";
}
