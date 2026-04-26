"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from "react";
import type { PetRuntimeState } from "@/types";
import type {
  ConversationTurnResult,
  ExperienceManifest,
  ExperienceSpaceSummary,
  PlannedMotion
} from "@/server/conversation/types";
import { FloatingChatBar } from "@/components/chat/FloatingChatBar";
import { ExperienceAudio } from "./ExperienceAudio";
import { MemoryScene } from "./MemoryScene";

interface MemorySpaceClientProps {
  manifest: ExperienceManifest;
}

interface ProjectSpacesResponse {
  spaces: ExperienceSpaceSummary[];
}

interface ProjectSpaceManifestResponse {
  manifest: ExperienceManifest;
}

interface DreamFragmentsResponse {
  fragments: DreamFragmentSummary[];
  pending: boolean;
}

interface DreamFragmentSummary {
  id: string;
  imageUrl: string | null;
  sourceImageUrl: string;
  status: "queued" | "generating" | "ready" | "failed";
}

const SPACE_POLL_INTERVAL_MS = 4_000;
const DREAM_FRAGMENT_POLL_INTERVAL_MS = 4_000;

export function MemorySpaceClient({ manifest }: MemorySpaceClientProps) {
  const [currentManifest, setCurrentManifest] = useState(manifest);
  const [spaces, setSpaces] = useState<ExperienceSpaceSummary[]>(
    manifest.spaces
  );
  const [petState, setPetState] = useState<PetRuntimeState>(
    manifest.pet.runtimeState
  );
  const [activeMotion, setActiveMotion] = useState<PlannedMotion | null>(null);
  const motionQueueRef = useRef<PlannedMotion[]>([]);
  const finalPetStateRef = useRef<PetRuntimeState | null>(null);
  const [switchingSceneClusterId, setSwitchingSceneClusterId] = useState<
    string | null
  >(null);
  const [canPrepareBackgroundSpaces, setCanPrepareBackgroundSpaces] =
    useState(false);
  const [dreamFragments, setDreamFragments] = useState<DreamFragmentSummary[]>(
    []
  );
  const [dreamFragmentsPending, setDreamFragmentsPending] = useState(false);
  const [selectedDreamFragment, setSelectedDreamFragment] =
    useState<DreamFragmentSummary | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareCopyState, setShareCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleRoomReady = useCallback(() => {
    setCanPrepareBackgroundSpaces(true);
  }, []);

  useEffect(() => {
    if (!canPrepareBackgroundSpaces) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    async function pollSpaces() {
      try {
        const response = await fetch(
          buildSpacesUrl(
            currentManifest.projectId,
            currentManifest.world.sceneClusterId
          ),
          {
            cache: "no-store"
          }
        );

        if (response.ok) {
          const result = (await response.json()) as ProjectSpacesResponse;

          if (!cancelled) {
            setSpaces(result.spaces);

            if (!shouldPollSpaces(result.spaces)) {
              return;
            }
          }
        }
      } catch {
        // Space generation continues server-side; the next poll can catch up.
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(() => {
          void pollSpaces();
        }, SPACE_POLL_INTERVAL_MS);
      }
    }

    void pollSpaces();

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    canPrepareBackgroundSpaces,
    currentManifest.projectId,
    currentManifest.world.sceneClusterId
  ]);

  useEffect(() => {
    const sceneClusterId = currentManifest.world.sceneClusterId;

    if (!canPrepareBackgroundSpaces || !sceneClusterId) {
      const resetId = window.setTimeout(() => {
        setDreamFragments([]);
        setDreamFragmentsPending(false);
      }, 0);

      return () => window.clearTimeout(resetId);
    }

    const activeSceneClusterId = sceneClusterId;
    let cancelled = false;
    let timeoutId: number | null = null;
    const resetId = window.setTimeout(() => {
      setDreamFragments([]);
      setDreamFragmentsPending(true);
    }, 0);

    async function pollDreamFragments() {
      try {
        const response = await fetch(
          buildDreamFragmentsUrl(
            currentManifest.projectId,
            activeSceneClusterId
          ),
          {
            cache: "no-store"
          }
        );

        if (response.ok) {
          const result = (await response.json()) as DreamFragmentsResponse;

          if (!cancelled) {
            setDreamFragments(result.fragments);
            setDreamFragmentsPending(result.pending);

            if (!result.pending) {
              return;
            }
          }
        }
      } catch {
        // Dream fragments are decorative; the room remains usable.
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(() => {
          void pollDreamFragments();
        }, DREAM_FRAGMENT_POLL_INTERVAL_MS);
      }
    }

    void pollDreamFragments();

    return () => {
      cancelled = true;
      window.clearTimeout(resetId);

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    canPrepareBackgroundSpaces,
    currentManifest.projectId,
    currentManifest.world.sceneClusterId
  ]);

  function handleConversationTurn(turn: ConversationTurnResult) {
    const queue =
      Array.isArray(turn.motionQueue) && turn.motionQueue.length > 0
        ? turn.motionQueue
        : [turn.motion];

    finalPetStateRef.current = turn.petState;
    motionQueueRef.current = queue;
    setActiveMotion(queue[0] ?? null);
    setPetState(
      queue[0] ? buildPetStateForMotionStart(turn.petState, queue) : turn.petState
    );
  }

  function handleMotionComplete(sequenceId: string) {
    const completedMotion = motionQueueRef.current[0];

    if (!completedMotion || completedMotion.sequenceId !== sequenceId) {
      return;
    }

    const remainingQueue = motionQueueRef.current.slice(1);
    const nextMotion = remainingQueue[0] ?? null;

    motionQueueRef.current = remainingQueue;
    setActiveMotion(nextMotion);
    setPetState((currentState) =>
      buildPetStateAfterMotion({
        currentState,
        completedMotion,
        nextMotion,
        remainingQueue,
        finalPetState: finalPetStateRef.current
      })
    );

    if (!nextMotion) {
      finalPetStateRef.current = null;
    }
  }

  async function handleSpaceSelect(space: ExperienceSpaceSummary) {
    if (
      !space.canEnter ||
      switchingSceneClusterId ||
      space.sceneClusterId === currentManifest.world.sceneClusterId
    ) {
      return;
    }

    setSwitchingSceneClusterId(space.sceneClusterId);

    try {
      const response = await fetch(
        buildSpaceManifestUrl(currentManifest.projectId, space.sceneClusterId),
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as ProjectSpaceManifestResponse;
      setCurrentManifest(result.manifest);
      setSpaces(result.manifest.spaces);
      setPetState(result.manifest.pet.runtimeState);
      setActiveMotion(null);
      motionQueueRef.current = [];
      finalPetStateRef.current = null;
    } finally {
      setSwitchingSceneClusterId(null);
    }
  }

  function openShareDialog() {
    setShareUrl(window.location.href);
    setShareCopyState("idle");
    setIsShareDialogOpen(true);
  }

  function closeShareDialog() {
    setIsShareDialogOpen(false);
    shareButtonRef.current?.focus();
  }

  async function copyShareUrl() {
    const url = shareUrl || window.location.href;

    try {
      await copyTextToClipboard(url);
      setShareCopyState("copied");
    } catch {
      setShareCopyState("failed");
    }
  }

  return (
    <main className="space-shell">
      {currentManifest.displayName ? (
        <div className="space-title-badge" aria-label="Dream name">
          <span>{getPossessiveName(currentManifest.displayName)} dream</span>
        </div>
      ) : null}
      <button
        ref={shareButtonRef}
        type="button"
        className="space-share-button"
        aria-label="Share this dream"
        title="Share this dream"
        onClick={openShareDialog}
      >
        <ShareIcon />
      </button>
      <MemoryScene
        key={`scene-${currentManifest.world.sceneClusterId ?? currentManifest.generatedAt}`}
        manifest={currentManifest}
        activeMotion={activeMotion}
        petState={petState}
        onMotionComplete={handleMotionComplete}
        onRoomReady={handleRoomReady}
      />
      <ExperienceAudio
        key={`audio-${currentManifest.world.sceneClusterId ?? "default"}`}
        projectId={currentManifest.projectId}
        sceneClusterId={currentManifest.world.sceneClusterId}
        audio={currentManifest.audio}
        activeMotion={activeMotion}
      />
      <DreamSpaceSwitcher
        spaces={spaces}
        switchingSceneClusterId={switchingSceneClusterId}
        onSelect={handleSpaceSelect}
      />
      <DreamFragmentShelf
        fragments={dreamFragments}
        pending={dreamFragmentsPending}
        onSelect={setSelectedDreamFragment}
      />
      {selectedDreamFragment?.imageUrl ? (
        <DreamFragmentModal
          fragment={selectedDreamFragment}
          onClose={() => setSelectedDreamFragment(null)}
        />
      ) : null}
      {isShareDialogOpen ? (
        <ShareDialog
          shareUrl={shareUrl}
          copyState={shareCopyState}
          onCopy={() => {
            void copyShareUrl();
          }}
          onClose={closeShareDialog}
        />
      ) : null}
      <FloatingChatBar
        projectId={currentManifest.projectId}
        chatAccessToken={currentManifest.chatAccessToken}
        realtimeAccessToken={currentManifest.realtimeAccessToken}
        onConversationTurn={handleConversationTurn}
      />
    </main>
  );
}

function ShareDialog({
  shareUrl,
  copyState,
  onCopy,
  onClose
}: {
  shareUrl: string;
  copyState: "idle" | "copied" | "failed";
  onCopy: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const copyStatus =
    copyState === "copied"
      ? "Address copied."
      : copyState === "failed"
        ? "Copy failed. Select the address and copy it manually."
        : "Copy this address to share the dream.";

  useEffect(() => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
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

  return (
    <div className="share-dialog" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="share-dialog-backdrop"
        aria-label="Close share dialog"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        className="share-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        aria-describedby="share-dialog-status"
      >
        <button
          type="button"
          className="share-dialog-close"
          aria-label="Close share dialog"
          onClick={onClose}
        >
          Close
        </button>
        <p className="eyebrow">Share</p>
        <h2 id="share-dialog-title">Share this dream</h2>
        <div className="share-url-row">
          <input
            ref={urlInputRef}
            type="text"
            readOnly
            value={shareUrl}
            aria-label="Dream address"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="button button-primary" onClick={onCopy}>
            Copy
          </button>
        </div>
        <p
          id="share-dialog-status"
          className={copyState === "failed" ? "form-warning" : "share-copy-status"}
          aria-live="polite"
        >
          {copyStatus}
        </p>
      </section>
    </div>
  );
}

function DreamFragmentShelf({
  fragments,
  pending,
  onSelect
}: {
  fragments: DreamFragmentSummary[];
  pending: boolean;
  onSelect: (fragment: DreamFragmentSummary) => void;
}) {
  const readyFragments = fragments.filter((fragment) => fragment.imageUrl);
  const pendingCount = pending ? Math.max(1, 2 - readyFragments.length) : 0;

  if (readyFragments.length === 0 && pendingCount === 0) {
    return null;
  }

  return (
    <div className="dream-fragment-shelf" aria-label="Dream photo pieces">
      {readyFragments.map((fragment) => (
        <button
          key={`dream-fragment-${fragment.id}`}
          type="button"
          className="dream-fragment-piece"
          onClick={() => onSelect(fragment)}
          aria-label="Open dream photo piece"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fragment.imageUrl ?? ""} alt="" />
        </button>
      ))}
      {Array.from({ length: pendingCount }).map((_, index) => (
        <div
          key={`dream-fragment-pending-${index}`}
          className="dream-fragment-piece dream-fragment-piece-pending"
          aria-label="Preparing dream photo piece"
        />
      ))}
    </div>
  );
}

function DreamFragmentModal({
  fragment,
  onClose
}: {
  fragment: DreamFragmentSummary;
  onClose: () => void;
}) {
  if (!fragment.imageUrl) {
    return null;
  }

  return (
    <div className="dream-fragment-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="dream-fragment-modal-backdrop"
        aria-label="Close dream photo piece"
        onClick={onClose}
      />
      <div className="dream-fragment-modal-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fragment.imageUrl} alt="Dream photo piece" />
        <button
          type="button"
          className="dream-fragment-modal-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function buildPetStateForMotionStart(
  finalPetState: PetRuntimeState,
  queue: readonly PlannedMotion[]
): PetRuntimeState {
  const firstMotion = queue[0];

  if (!firstMotion) {
    return finalPetState;
  }

  return {
    ...finalPetState,
    currentPose: firstMotion.fromState,
    targetPose: finalPetState.currentPose,
    currentClipId: firstMotion.clipId,
    queuedMotionKeys: queue.map((motion) => motion.motionKey)
  };
}

function buildPetStateAfterMotion({
  currentState,
  completedMotion,
  nextMotion,
  remainingQueue,
  finalPetState
}: {
  currentState: PetRuntimeState;
  completedMotion: PlannedMotion;
  nextMotion: PlannedMotion | null;
  remainingQueue: readonly PlannedMotion[];
  finalPetState: PetRuntimeState | null;
}): PetRuntimeState {
  if (!nextMotion && finalPetState) {
    return finalPetState;
  }

  return {
    ...currentState,
    currentPose: completedMotion.toState,
    targetPose: finalPetState?.targetPose ?? currentState.targetPose,
    currentClipId: nextMotion?.clipId ?? null,
    queuedMotionKeys: remainingQueue.map((motion) => motion.motionKey),
    lastUpdatedAt: finalPetState?.lastUpdatedAt ?? currentState.lastUpdatedAt
  };
}

function getPossessiveName(displayName: string): string {
  return displayName.endsWith("s") ? `${displayName}'` : `${displayName}'s`;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.6 12.8 15.4 16.7" />
      <path d="M15.4 7.3 8.6 11.2" />
      <circle cx="6.5" cy="12" r="2.4" />
      <circle cx="17.5" cy="6.2" r="2.4" />
      <circle cx="17.5" cy="17.8" r="2.4" />
    </svg>
  );
}

function DreamSpaceSwitcher({
  spaces,
  switchingSceneClusterId,
  onSelect
}: {
  spaces: ExperienceSpaceSummary[];
  switchingSceneClusterId: string | null;
  onSelect: (space: ExperienceSpaceSummary) => void;
}) {
  const alternateSpaces = spaces.filter((space) => !space.active);

  if (alternateSpaces.length === 0) {
    return null;
  }

  return (
    <div className="dream-space-switcher" aria-label="Other memory spaces">
      {alternateSpaces.map((space, index) => {
        const isGenerating = !space.canEnter && space.status !== "failed";
        const label =
          space.status === "failed"
            ? "This dream paused"
            : space.canEnter
              ? `Enter ${space.label}`
              : `Waking this dream... (${space.progress}%)`;
        const isSwitching = switchingSceneClusterId === space.sceneClusterId;

        return (
          <button
            key={`space-${space.sceneClusterId}-${index}`}
            type="button"
            className={`dream-space-sphere${
              isGenerating ? " dream-space-sphere-generating" : ""
            }${isSwitching ? " dream-space-sphere-switching" : ""}`}
            style={getDreamSphereStyle(space.thumbnailUrl)}
            aria-label={label}
            aria-disabled={!space.canEnter || isSwitching}
            onClick={() => onSelect(space)}
          >
            <span className="dream-space-sphere-shine" aria-hidden="true" />
            <span className="dream-space-tooltip">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function shouldPollSpaces(spaces: ExperienceSpaceSummary[]): boolean {
  return (
    spaces.length < 2 ||
    spaces.some((space) => !space.active && space.status !== "ready")
  );
}

function getDreamSphereStyle(thumbnailUrl: string | null) {
  return thumbnailUrl
    ? ({
        "--dream-space-image": `url("${thumbnailUrl}")`
      } as CSSProperties)
    : undefined;
}

function buildSpacesUrl(
  projectId: string,
  activeSceneClusterId: string | null
): string {
  const url = new URL(
    `/api/projects/${encodeURIComponent(projectId)}/spaces`,
    window.location.origin
  );

  if (activeSceneClusterId) {
    url.searchParams.set("activeSceneClusterId", activeSceneClusterId);
  }

  return url.pathname + url.search;
}

function buildSpaceManifestUrl(projectId: string, sceneClusterId: string): string {
  const url = new URL(
    `/api/projects/${encodeURIComponent(projectId)}/space`,
    window.location.origin
  );

  url.searchParams.set("sceneClusterId", sceneClusterId);
  return url.pathname + url.search;
}

function buildDreamFragmentsUrl(
  projectId: string,
  sceneClusterId: string
): string {
  const url = new URL(
    `/api/projects/${encodeURIComponent(projectId)}/dream-fragments`,
    window.location.origin
  );

  url.searchParams.set("sceneClusterId", sceneClusterId);
  return url.pathname + url.search;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed.");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
