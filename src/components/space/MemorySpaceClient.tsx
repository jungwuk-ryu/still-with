"use client";

import { useEffect, useState } from "react";
import type { PetRuntimeState } from "@/types";
import type {
  ConversationTurnResult,
  ExperienceManifest,
  PlannedMotion
} from "@/server/conversation/types";
import { FloatingChatBar } from "@/components/chat/FloatingChatBar";
import { ExperienceAudio } from "./ExperienceAudio";
import { MemoryScene } from "./MemoryScene";

interface MemorySpaceClientProps {
  manifest: ExperienceManifest;
}

export function MemorySpaceClient({ manifest }: MemorySpaceClientProps) {
  const [petState, setPetState] = useState<PetRuntimeState>(
    manifest.pet.runtimeState
  );
  const [activeMotion, setActiveMotion] = useState<PlannedMotion | null>(null);

  function handleConversationTurn(turn: ConversationTurnResult) {
    setPetState(turn.petState);
    setActiveMotion(turn.motion);
  }

  useEffect(() => {
    if (!activeMotion || activeMotion.loopable) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveMotion(null);
    }, Math.max(activeMotion.durationMs, 250));

    return () => window.clearTimeout(timeout);
  }, [activeMotion]);

  return (
    <main className="space-shell">
      <MemoryScene
        manifest={manifest}
        activeMotion={activeMotion}
        petState={petState}
      />
      <ExperienceAudio audio={manifest.audio} activeMotion={activeMotion} />
      <FloatingChatBar
        projectId={manifest.projectId}
        chatAccessToken={manifest.chatAccessToken}
        realtimeAccessToken={manifest.realtimeAccessToken}
        onConversationTurn={handleConversationTurn}
      />
    </main>
  );
}
