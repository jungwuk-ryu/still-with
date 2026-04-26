"use client";

import { useState } from "react";
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

  function handleMotionComplete(sequenceId: string) {
    setActiveMotion((currentMotion) =>
      currentMotion?.sequenceId === sequenceId ? null : currentMotion
    );
  }

  return (
    <main className="space-shell">
      <MemoryScene
        manifest={manifest}
        activeMotion={activeMotion}
        petState={petState}
        onMotionComplete={handleMotionComplete}
      />
      <ExperienceAudio
        projectId={manifest.projectId}
        audio={manifest.audio}
        activeMotion={activeMotion}
      />
      <FloatingChatBar
        projectId={manifest.projectId}
        chatAccessToken={manifest.chatAccessToken}
        realtimeAccessToken={manifest.realtimeAccessToken}
        onConversationTurn={handleConversationTurn}
      />
    </main>
  );
}
