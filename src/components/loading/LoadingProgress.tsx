"use client";

import { useEffect, useMemo, useState } from "react";
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
  nextRoute: string | null;
  canEnter: boolean;
  needsClarification: boolean;
  uploadedImages: PublicProjectImage[];
  spacePreviewImages: PublicSpacePreviewImage[];
  selectedPetId: string | null;
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
        title: stageTitles[0] ?? "Looking through your memories",
        description:
          "Finding the moments, colors, and places that appear in your photos."
      },
      retry: null,
      canEnter: false,
      nextRoute: null,
      spacePreviewImages: [],
      status: "uploading" as ProjectStatus
    };
  }, [stageTitles, status]);

  if (isMissingProject) {
    return (
      <section className="progress-panel" aria-labelledby="loading-title">
        <div className="ambient-memory" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
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
        <div className="ambient-memory" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">A gentle pause</p>
        <h1 id="loading-title">This needs a little more time</h1>
        <p className="panel-subtitle">
          The memory could not be prepared just yet. You can begin again when
          you&apos;re ready.
        </p>
        <Link className="button button-secondary" href="/">
          Start again
        </Link>
      </section>
    );
  }

  return (
    <section
      className="progress-panel"
      aria-labelledby="loading-title"
      aria-live="polite"
    >
      <div className="ambient-memory" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <p className="eyebrow">{visibleStatus.stage.label}</p>
      <h1 id="loading-title">A quiet place is being prepared</h1>
      <p className="panel-subtitle">
        We&apos;re taking a little time to make this feel gentle, familiar, and
        safe.
      </p>

      <div className="current-stage">
        <span>{visibleStatus.stage.title}</span>
        <p>{visibleStatus.stage.description}</p>
      </div>

      {visibleStatus.spacePreviewImages.length > 0 ? (
        <ul
          className="space-preview-strip"
          aria-hidden="true"
        >
          {visibleStatus.spacePreviewImages.map((preview) => (
            <li key={preview.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt=""
                loading="eager"
                draggable={false}
              />
            </li>
          ))}
        </ul>
      ) : null}

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
