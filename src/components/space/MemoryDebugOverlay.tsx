"use client";

import type { PetRuntimeState } from "@/types";

interface MemoryDebugOverlayProps {
  visible: boolean;
  fps: number;
  assetTier: string;
  assetStatus: string;
  petState: PetRuntimeState;
}

export function MemoryDebugOverlay({
  visible,
  fps,
  assetTier,
  assetStatus,
  petState
}: MemoryDebugOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <aside className="space-debug-overlay" aria-label="Debug status">
      <dl>
        <div>
          <dt>FPS</dt>
          <dd>{Math.round(fps)}</dd>
        </div>
        <div>
          <dt>Asset tier</dt>
          <dd>{assetTier}</dd>
        </div>
        <div>
          <dt>Asset status</dt>
          <dd>{assetStatus}</dd>
        </div>
        <div>
          <dt>Pet state</dt>
          <dd>{petState.currentPose}</dd>
        </div>
      </dl>
    </aside>
  );
}
