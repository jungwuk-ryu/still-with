"use client";

import {
  useCallback,
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
  displayName: string | null;
  isPublic: boolean;
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
  publicEntry?: boolean;
}

const LOADING_AMBIENT_AUDIO_SRC =
  "/audio/floating-dream-loop-2026-04-26.mp3";
const LOADING_AMBIENT_VOLUME = 1;
const AUDIO_FADE_DURATION_MS = 720;
const PUBLIC_ENTRY_STAGE_MS = 5_000;
const PUBLIC_ENTRY_DESCRIPTIONS = [
  "Gathering the light already waiting in this dream.",
  "Opening the familiar traces without changing them.",
  "Letting the room settle into view.",
  "Preloading the space before you step inside.",
  "Bringing the gentle presence into place.",
  "Listening for the quiet details.",
  "Your memory space is ready when you are."
];
type AmbientAudioPlaybackState = "playing" | "paused" | "blocked";

export function LoadingProgress({
  projectId,
  initialStatus,
  stageTitles,
  publicEntry = false
}: LoadingProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PublicProjectStatus | null>(initialStatus);
  const [publicEntryStageIndex, setPublicEntryStageIndex] = useState(
    publicEntry ? 0 : null
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isMissingProject, setIsMissingProject] = useState(initialStatus === null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isAmbientSoundEnabled, setIsAmbientSoundEnabled] = useState(true);
  const [ambientAudioPlaybackState, setAmbientAudioPlaybackState] =
    useState<AmbientAudioPlaybackState>("paused");
  const [hasEmailSubscription, setHasEmailSubscription] = useState(
    initialStatus?.hasCompletionEmailSubscription ?? false
  );
  const emailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const emailDialogRef = useRef<HTMLElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientFadeRef = useRef<number | null>(null);
  const ambientAudioInitializedRef = useRef(false);

  const fadeAmbientAudioTo = useCallback(
    (targetVolume: number, onComplete?: () => void) => {
      const audio = ambientAudioRef.current;

      if (!audio) {
        onComplete?.();
        return;
      }

      if (ambientFadeRef.current !== null) {
        window.cancelAnimationFrame(ambientFadeRef.current);
      }

      const startVolume = audio.volume;
      const startedAt = performance.now();
      const activeAudio = audio;

      function step(now: number) {
        const progress = Math.min(
          (now - startedAt) / AUDIO_FADE_DURATION_MS,
          1
        );
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        activeAudio.volume =
          startVolume + (targetVolume - startVolume) * easedProgress;

        if (progress < 1) {
          ambientFadeRef.current = window.requestAnimationFrame(step);
          return;
        }

        ambientFadeRef.current = null;
        activeAudio.volume = targetVolume;
        onComplete?.();
      }

      ambientFadeRef.current = window.requestAnimationFrame(step);
    },
    []
  );

  const playAmbientAudio = useCallback(() => {
    const audio = ambientAudioRef.current;

    if (!audio) {
      return;
    }

    if (!ambientAudioInitializedRef.current) {
      audio.volume = 0;
      ambientAudioInitializedRef.current = true;
    }

    void audio
      .play()
      .then(() => {
        setAmbientAudioPlaybackState("playing");
        fadeAmbientAudioTo(LOADING_AMBIENT_VOLUME);
      })
      .catch(() => {
        setAmbientAudioPlaybackState("blocked");
      });
  }, [fadeAmbientAudioTo]);

  const playAmbientAudioWhenReady = useCallback(() => {
    if (!isAmbientSoundEnabled) {
      return;
    }

    playAmbientAudio();
  }, [isAmbientSoundEnabled, playAmbientAudio]);

  useEffect(() => {
    if (publicEntry) {
      return;
    }

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
  }, [projectId, publicEntry]);

  useEffect(() => {
    if (!publicEntry || !status?.nextRoute) {
      return;
    }

    router.prefetch(status.nextRoute);

    for (const preview of status.spacePreviewImages.slice(0, 2)) {
      const image = new Image();
      image.src = preview.url;
    }
  }, [publicEntry, router, status?.nextRoute, status?.spacePreviewImages]);

  useEffect(() => {
    if (
      !publicEntry ||
      publicEntryStageIndex === null ||
      publicEntryStageIndex >= stageTitles.length - 1
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPublicEntryStageIndex((currentIndex) =>
        Math.min((currentIndex ?? 0) + 1, stageTitles.length - 1)
      );
    }, PUBLIC_ENTRY_STAGE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [publicEntry, publicEntryStageIndex, stageTitles.length]);

  useEffect(() => {
    if (publicEntry || !status?.needsClarification || !status.nextRoute) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      router.push(status.nextRoute ?? `/projects/${projectId}/clarify`);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [projectId, publicEntry, router, status?.needsClarification, status?.nextRoute]);

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

  useEffect(() => {
    const audio = ambientAudioRef.current;

    if (!audio) {
      return;
    }

    if (!ambientAudioInitializedRef.current) {
      audio.volume = 0;
      ambientAudioInitializedRef.current = true;
    }

    if (isAmbientSoundEnabled) {
      playAmbientAudio();
      return;
    }

    if (ambientFadeRef.current !== null) {
      window.cancelAnimationFrame(ambientFadeRef.current);
      ambientFadeRef.current = null;
    }

    if (audio.paused) {
      setAmbientAudioPlaybackState("paused");
    } else {
      fadeAmbientAudioTo(0, () => {
        audio.pause();
        setAmbientAudioPlaybackState("paused");
      });
    }
  }, [fadeAmbientAudioTo, isAmbientSoundEnabled, playAmbientAudio]);

  useEffect(() => {
    if (
      ambientAudioPlaybackState !== "blocked" ||
      !isAmbientSoundEnabled
    ) {
      return;
    }

    window.addEventListener("pointerdown", playAmbientAudio, { once: true });
    window.addEventListener("keydown", playAmbientAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", playAmbientAudio);
      window.removeEventListener("keydown", playAmbientAudio);
    };
  }, [ambientAudioPlaybackState, isAmbientSoundEnabled, playAmbientAudio]);

  useEffect(
    () => () => {
      if (ambientFadeRef.current !== null) {
        window.cancelAnimationFrame(ambientFadeRef.current);
      }
    },
    []
  );

  const visibleStatus = useMemo(() => {
    if (status) {
      if (publicEntry && publicEntryStageIndex !== null) {
        return getPublicEntryStatus(status, publicEntryStageIndex, stageTitles);
      }

      return status;
    }

    return {
      projectId,
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
      displayName: null,
      isPublic: false,
      needsClarification: false,
      uploadedImages: [],
      spacePreviewImages: [],
      selectedPetId: null,
      hasCompletionEmailSubscription: hasEmailSubscription,
      updatedAt: new Date().toISOString(),
      status: "uploading" as ProjectStatus
    };
  }, [
    hasEmailSubscription,
    projectId,
    publicEntry,
    publicEntryStageIndex,
    stageTitles,
    status
  ]);
  const activeIndex = visibleStatus.stage.index;
  const previewBackgroundImages = visibleStatus.spacePreviewImages.slice(0, 2);
  const dreamTitle = getLoadingTitle(visibleStatus.displayName, publicEntry);
  const dreamSubtitle = publicEntry
    ? "The room is already prepared. We are preloading the dream before you step inside."
    : "A familiar room is slowly taking shape, like stepping into a soft dream.";
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
      <audio
        ref={ambientAudioRef}
        src={LOADING_AMBIENT_AUDIO_SRC}
        preload="auto"
        loop
        onCanPlay={playAmbientAudioWhenReady}
      />

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

      <div
        className="loading-progress-stack"
        aria-hidden={isEmailDialogOpen ? "true" : undefined}
      >
        <section className="progress-panel" aria-labelledby="loading-title">
          <p className="eyebrow">{visibleStatus.stage.label}</p>
          <h1 id="loading-title">{dreamTitle}</h1>
          <p className="panel-subtitle">{dreamSubtitle}</p>

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

          {!visibleStatus.canEnter && !publicEntry ? (
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

        <button
          type="button"
          className="loading-sound-toggle"
          aria-pressed={
            isAmbientSoundEnabled &&
            ambientAudioPlaybackState === "playing"
          }
          onClick={() => {
            if (
              isAmbientSoundEnabled &&
              ambientAudioPlaybackState !== "playing"
            ) {
              playAmbientAudio();
              return;
            }

            setIsAmbientSoundEnabled((enabled) => !enabled);
          }}
        >
          <span className="loading-sound-toggle-mark" aria-hidden="true" />
          <span>Sound</span>
        </button>
      </div>

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

function getPublicEntryStatus(
  status: PublicProjectStatus,
  stageIndex: number,
  stageTitles: string[]
): PublicProjectStatus {
  const safeStageIndex = Math.min(stageIndex, stageTitles.length - 1);
  const canEnter = safeStageIndex >= stageTitles.length - 1 && status.canEnter;

  return {
    ...status,
    stage: {
      index: safeStageIndex,
      total: stageTitles.length,
      label: `Step ${safeStageIndex + 1} of ${stageTitles.length}`,
      title: stageTitles[safeStageIndex] ?? status.stage.title,
      description:
        PUBLIC_ENTRY_DESCRIPTIONS[safeStageIndex] ?? status.stage.description
    },
    canEnter,
    nextRoute: canEnter ? status.nextRoute : null,
    retry: null,
    error: null
  };
}

function getLoadingTitle(displayName: string | null, publicEntry: boolean): string {
  if (displayName) {
    return publicEntry
      ? `Opening ${getPossessiveName(displayName)} dream`
      : `Waking ${getPossessiveName(displayName)} dream`;
  }

  return publicEntry ? "Opening a quiet dream" : "Waking a quiet memory";
}

function getPossessiveName(displayName: string): string {
  return displayName.endsWith("s") ? `${displayName}'` : `${displayName}'s`;
}
