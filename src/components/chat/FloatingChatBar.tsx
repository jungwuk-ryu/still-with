"use client";

import { FormEvent, useState } from "react";
import type {
  ConversationTurnResponse,
  ConversationTurnResult
} from "@/server/conversation/types";
import { MicrophoneButton } from "@/components/realtime/MicrophoneButton";

interface FloatingChatBarProps {
  projectId: string;
  chatAccessToken: string | null;
  realtimeAccessToken: string | null;
  onConversationTurn: (turn: ConversationTurnResult) => void;
}

export function FloatingChatBar({
  projectId,
  chatAccessToken,
  realtimeAccessToken,
  onConversationTurn
}: FloatingChatBarProps) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Ready for a gentle cue.");
  const [isSending, setIsSending] = useState(false);
  const [currentChatAccessToken, setCurrentChatAccessToken] =
    useState(chatAccessToken);

  async function sendMessage(nextMessage: string) {
    const trimmed = nextMessage.trim();

    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setStatus("Noticing your words...");

    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Still-With-Chat-Token": currentChatAccessToken ?? ""
        },
        body: JSON.stringify({ message: trimmed })
      });
      const result = (await response.json()) as
        | ConversationTurnResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          isChatError(result) && result.error
            ? result.error
            : "The message could not be sent."
        );
      }

      if (isChatError(result)) {
        throw new Error(result.error || "The message could not be sent.");
      }

      setCurrentChatAccessToken(result.nextChatAccessToken);
      setStatus(
        result.motion.clipId
          ? "Your pet is responding with a gentle movement."
          : "Your pet is staying close."
      );
      onConversationTurn(result);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The message could not be sent."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message;
    setMessage("");
    await sendMessage(nextMessage);
  }

  return (
    <div className="experience-chat-shell">
      <form className="floating-chat" aria-label="Message input" onSubmit={handleSubmit}>
        <input
          value={message}
          placeholder="Say something, or ask for a movement..."
          aria-label="Message"
          onChange={(event) => setMessage(event.target.value)}
        />
        <MicrophoneButton
          projectId={projectId}
          accessToken={realtimeAccessToken}
          disabled={isSending}
          onVoiceText={(text) => {
            setMessage("");
            void sendMessage(text);
          }}
          onStatusChange={setStatus}
        />
        <button className="button button-primary" type="submit" disabled={isSending}>
          Send
        </button>
      </form>
      <p className="chat-status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function isChatError(
  result: ConversationTurnResponse | { error?: string }
): result is { error?: string } {
  return "error" in result;
}
