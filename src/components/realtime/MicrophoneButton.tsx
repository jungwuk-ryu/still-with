"use client";

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

interface MicrophoneButtonProps {
  projectId: string;
  accessToken: string | null;
  disabled?: boolean;
  onVoiceText: (text: string) => void;
  onStatusChange?: (status: string) => void;
}

interface RealtimeSecretResponse {
  clientSecret?: string;
  expiresAt?: number;
  model?: string;
  error?: string;
}

interface PendingRealtimeStart {
  abortController: AbortController;
  stream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  cancelled: boolean;
}

export function MicrophoneButton({
  projectId,
  accessToken,
  disabled,
  onVoiceText,
  onStatusChange
}: MicrophoneButtonProps) {
  const [state, setState] = useState<"idle" | "connecting" | "listening">(
    "idle"
  );
  const connectionRef = useRef<{
    peerConnection: RTCPeerConnection;
    stream: MediaStream;
    dataChannel: RTCDataChannel;
  } | null>(null);
  const pendingRef = useRef<PendingRealtimeStart | null>(null);

  useEffect(
    () => () => {
      cleanupPendingStart(pendingRef);
      stopRealtime(connectionRef);
    },
    []
  );

  async function toggleMicrophone() {
    if (state === "listening") {
      stopRealtime(connectionRef);
      setState("idle");
      onStatusChange?.("Voice stopped.");
      return;
    }

    setState("connecting");
    onStatusChange?.("Requesting microphone access...");

    cleanupPendingStart(pendingRef);
    const pending: PendingRealtimeStart = {
      abortController: new AbortController(),
      stream: null,
      peerConnection: null,
      dataChannel: null,
      cancelled: false
    };
    pendingRef.current = pending;

    try {
      if (!accessToken) {
        throw new Error("Voice is unavailable for this memory space.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pending.stream = stream;
      ensureStartStillActive(pending);

      const tokenResponse = await fetch("/api/realtime/client-secret", {
        method: "POST",
        signal: pending.abortController.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Still-With-Space-Token": accessToken
        },
        body: JSON.stringify({ projectId })
      });
      const tokenData = (await tokenResponse.json()) as RealtimeSecretResponse;
      ensureStartStillActive(pending);

      if (!tokenResponse.ok || !tokenData.clientSecret) {
        throw new Error(tokenData.error || "Voice is unavailable right now.");
      }

      const peerConnection = new RTCPeerConnection();
      pending.peerConnection = peerConnection;
      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const dataChannel = peerConnection.createDataChannel("oai-events");
      pending.dataChannel = dataChannel;
      dataChannel.addEventListener("message", (event) => {
        const transcript = extractTranscript(event.data);

        if (transcript) {
          onVoiceText(transcript);
        }
      });

      const offer = await peerConnection.createOffer();
      ensureStartStillActive(pending);
      await peerConnection.setLocalDescription(offer);
      ensureStartStillActive(pending);

      const realtimeResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          signal: pending.abortController.signal,
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${tokenData.clientSecret}`,
            "Content-Type": "application/sdp"
          }
        }
      );

      if (!realtimeResponse.ok) {
        throw new Error("Voice could not connect.");
      }

      const answerSdp = await realtimeResponse.text();
      ensureStartStillActive(pending);
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });
      ensureStartStillActive(pending);

      connectionRef.current = {
        peerConnection,
        stream,
        dataChannel
      };
      pendingRef.current = null;
      setState("listening");
      onStatusChange?.("Listening...");
    } catch (error) {
      stopRealtime(connectionRef);
      cleanupPendingStart(pendingRef);
      cleanupPendingResource(pending);
      setState("idle");
      onStatusChange?.(
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : "Voice is unavailable. You can type instead."
      );
    }
  }

  const label =
    state === "listening" ? "Stop voice" : state === "connecting" ? "Connecting" : "Talk";

  return (
    <button
      className="icon-button chat-mic-button"
      type="button"
      aria-label={state === "listening" ? "Stop voice input" : "Start voice input"}
      aria-pressed={state === "listening"}
      disabled={disabled || state === "connecting"}
      onClick={toggleMicrophone}
    >
      <span className="mic-state-dot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function cleanupPendingStart(
  ref: MutableRefObject<PendingRealtimeStart | null>
) {
  const pending = ref.current;

  if (!pending) {
    return;
  }

  cleanupPendingResource(pending);
  ref.current = null;
}

function cleanupPendingResource(pending: PendingRealtimeStart) {
  pending.cancelled = true;
  pending.abortController.abort();
  pending.dataChannel?.close();
  pending.dataChannel = null;
  pending.peerConnection?.close();
  pending.peerConnection = null;
  pending.stream?.getTracks().forEach((track) => track.stop());
  pending.stream = null;
}

function ensureStartStillActive(pending: { cancelled: boolean }) {
  if (pending.cancelled) {
    throw new DOMException("Voice start was cancelled.", "AbortError");
  }
}

function stopRealtime(
  ref: MutableRefObject<{
    peerConnection: RTCPeerConnection;
    stream: MediaStream;
    dataChannel: RTCDataChannel;
  } | null>
) {
  const connection = ref.current;

  if (!connection) {
    return;
  }

  connection.dataChannel.close();
  connection.peerConnection.close();
  connection.stream.getTracks().forEach((track) => track.stop());
  ref.current = null;
}

function extractTranscript(rawData: unknown): string | null {
  if (typeof rawData !== "string") {
    return null;
  }

  try {
    const event = JSON.parse(rawData) as {
      type?: string;
      transcript?: string;
      delta?: string;
      item?: { content?: Array<{ transcript?: string; text?: string }> };
    };
    const contentTranscript = event.item?.content?.find(
      (item) => typeof item.transcript === "string" || typeof item.text === "string"
    );
    const transcript =
      event.transcript ?? contentTranscript?.transcript ?? contentTranscript?.text;

    if (transcript && event.type === "conversation.item.input_audio_transcription.completed") {
      return transcript.trim();
    }
  } catch {
    return null;
  }

  return null;
}
