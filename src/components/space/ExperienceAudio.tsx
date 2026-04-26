"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ExperienceAudioManifest,
  PlannedMotion
} from "@/server/conversation/types";

interface ExperienceAudioProps {
  projectId: string;
  audio: ExperienceAudioManifest;
  activeMotion: PlannedMotion | null;
}

type AudioBackfillStatus = "ready" | "queued" | "unavailable";

interface ProjectAudioPollResponse {
  audio: ExperienceAudioManifest;
  audioStatus: AudioBackfillStatus;
}

const MUSIC_VOLUME = 0.24;
const PET_EFFECT_VOLUME = 0.42;
const AUDIO_POLL_INTERVAL_MS = 4_000;

export function ExperienceAudio({
  projectId,
  audio,
  activeMotion
}: ExperienceAudioProps) {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const soundEffectRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const enabledRef = useRef(false);
  const lastMotionSequenceRef = useRef<string | null>(null);
  const [currentAudio, setCurrentAudio] =
    useState<ExperienceAudioManifest>(audio);
  const hasAudio = useMemo(
    () => hasPlayableAudio(currentAudio),
    [currentAudio]
  );
  const [audioStatus, setAudioStatus] = useState<AudioBackfillStatus>(
    hasPlayableAudio(audio) ? "ready" : "queued"
  );
  const [enabled, setEnabled] = useState(() => hasPlayableAudio(audio));
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (hasAudio || audioStatus === "unavailable") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    async function pollAudio() {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/audio`,
          {
            cache: "no-store"
          }
        );

        if (!response.ok) {
          scheduleNextPoll();
          return;
        }

        const result = (await response.json()) as ProjectAudioPollResponse;

        if (cancelled) {
          return;
        }

        if (hasPlayableAudio(result.audio)) {
          setCurrentAudio(result.audio);
          setAudioStatus("ready");
          setEnabled(true);
          setBlocked(false);
          return;
        }

        if (result.audioStatus === "unavailable") {
          setAudioStatus("unavailable");
          return;
        }
      } catch {
        // Keep the memory space quiet and try again; audio is an enhancement.
      }

      scheduleNextPoll();
    }

    function scheduleNextPoll() {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void pollAudio();
      }, AUDIO_POLL_INTERVAL_MS);
    }

    void pollAudio();

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [audioStatus, hasAudio, projectId]);

  useEffect(() => {
    if (!currentAudio.backgroundMusicUrl) {
      musicRef.current?.pause();
      musicRef.current = null;
      return;
    }

    const music = new Audio(currentAudio.backgroundMusicUrl);
    music.loop = true;
    music.preload = "auto";
    music.volume = MUSIC_VOLUME;
    musicRef.current = music;

    if (enabledRef.current) {
      void music
        .play()
        .then(() => setBlocked(false))
        .catch(() => {
          setEnabled(false);
          setBlocked(true);
        });
    }

    return () => {
      music.pause();
      music.removeAttribute("src");
      music.load();

      if (musicRef.current === music) {
        musicRef.current = null;
      }
    };
  }, [currentAudio.backgroundMusicUrl]);

  useEffect(() => {
    const effects = new Map<string, HTMLAudioElement>();

    for (const [intent, url] of Object.entries(currentAudio.petSoundEffects)) {
      if (!url) {
        continue;
      }

      const effect = new Audio(url);
      effect.preload = "auto";
      effect.volume = PET_EFFECT_VOLUME;
      effects.set(intent, effect);
    }

    soundEffectRefs.current = effects;

    return () => {
      for (const effect of effects.values()) {
        effect.pause();
        effect.removeAttribute("src");
        effect.load();
      }
    };
  }, [currentAudio.petSoundEffects]);

  useEffect(() => {
    const music = musicRef.current;

    if (!music) {
      return;
    }

    if (!enabled) {
      music.pause();
      return;
    }

    void music
      .play()
      .then(() => setBlocked(false))
      .catch(() => {
        setEnabled(false);
        setBlocked(true);
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !activeMotion) {
      return;
    }

    if (lastMotionSequenceRef.current === activeMotion.sequenceId) {
      return;
    }

    lastMotionSequenceRef.current = activeMotion.sequenceId;

    const effect = soundEffectRefs.current.get(activeMotion.key);

    if (!effect) {
      return;
    }

    effect.currentTime = 0;
    void effect.play().catch(() => {
      setEnabled(false);
      setBlocked(true);
    });
  }, [activeMotion, enabled]);

  if (!hasAudio) {
    return null;
  }

  const isMuted = !enabled;
  const label = isMuted ? "Play audio" : "Mute audio";
  const playbackState = enabled ? "playing" : blocked ? "blocked" : "muted";

  return (
    <button
      type="button"
      className={`space-audio-toggle space-audio-toggle-${playbackState}`}
      aria-label={label}
      aria-pressed={!isMuted}
      onClick={() => {
        setBlocked(false);
        setEnabled((current) => !current);
      }}
    >
      {isMuted ? <MutedIcon /> : <SoundIcon />}
    </button>
  );
}

function hasPlayableAudio(audio: ExperienceAudioManifest): boolean {
  return (
    Boolean(audio.backgroundMusicUrl) ||
    Object.keys(audio.petSoundEffects).length > 0
  );
}

function SoundIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z" />
      <path d="M16 8.2c1 .9 1.6 2.2 1.6 3.8S17 14.9 16 15.8" />
      <path d="M18.6 5.8c1.7 1.6 2.7 3.8 2.7 6.2s-1 4.6-2.7 6.2" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z" />
      <path d="m17 9 4 4" />
      <path d="m21 9-4 4" />
    </svg>
  );
}
