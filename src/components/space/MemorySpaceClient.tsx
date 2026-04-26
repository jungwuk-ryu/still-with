"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
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

const SPACE_POLL_INTERVAL_MS = 4_000;

export function MemorySpaceClient({ manifest }: MemorySpaceClientProps) {
  const [currentManifest, setCurrentManifest] = useState(manifest);
  const [spaces, setSpaces] = useState<ExperienceSpaceSummary[]>(
    manifest.spaces
  );
  const [petState, setPetState] = useState<PetRuntimeState>(
    manifest.pet.runtimeState
  );
  const [activeMotion, setActiveMotion] = useState<PlannedMotion | null>(null);
  const [switchingSceneClusterId, setSwitchingSceneClusterId] = useState<
    string | null
  >(null);
  const [canPrepareBackgroundSpaces, setCanPrepareBackgroundSpaces] =
    useState(false);

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

  function handleConversationTurn(turn: ConversationTurnResult) {
    setPetState(turn.petState);
    setActiveMotion(turn.motion);
  }

  function handleMotionComplete(sequenceId: string) {
    setActiveMotion((currentMotion) =>
      currentMotion?.sequenceId === sequenceId ? null : currentMotion
    );
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
    } finally {
      setSwitchingSceneClusterId(null);
    }
  }

  return (
    <main className="space-shell">
      {currentManifest.displayName ? (
        <div className="space-title-badge" aria-label="Dream name">
          <span>{getPossessiveName(currentManifest.displayName)} dream</span>
        </div>
      ) : null}
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
      <FloatingChatBar
        projectId={currentManifest.projectId}
        chatAccessToken={currentManifest.chatAccessToken}
        realtimeAccessToken={currentManifest.realtimeAccessToken}
        onConversationTurn={handleConversationTurn}
      />
    </main>
  );
}

function getPossessiveName(displayName: string): string {
  return displayName.endsWith("s") ? `${displayName}'` : `${displayName}'s`;
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
    spaces.length < 3 ||
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
