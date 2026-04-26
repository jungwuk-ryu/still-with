"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ExperienceAudioManifest,
  PlannedMotion
} from "@/server/conversation/types";

interface ExperienceAudioProps {
  audio: ExperienceAudioManifest;
  activeMotion: PlannedMotion | null;
}

const MUSIC_VOLUME = 0.24;
const PET_EFFECT_VOLUME = 0.42;

export function ExperienceAudio({ audio, activeMotion }: ExperienceAudioProps) {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const soundEffectRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const enabledRef = useRef(false);
  const lastMotionSequenceRef = useRef<string | null>(null);
  const hasAudio = useMemo(
    () =>
      Boolean(audio.backgroundMusicUrl) ||
      Object.keys(audio.petSoundEffects).length > 0,
    [audio.backgroundMusicUrl, audio.petSoundEffects]
  );
  const [enabled, setEnabled] = useState(hasAudio);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!audio.backgroundMusicUrl) {
      musicRef.current?.pause();
      musicRef.current = null;
      return;
    }

    const music = new Audio(audio.backgroundMusicUrl);
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
  }, [audio.backgroundMusicUrl]);

  useEffect(() => {
    const effects = new Map<string, HTMLAudioElement>();

    for (const [intent, url] of Object.entries(audio.petSoundEffects)) {
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
  }, [audio.petSoundEffects]);

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
