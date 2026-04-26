import { requireOpenAIApiKey } from "@/lib/env";

export interface RealtimeClientSecret {
  value: string;
  expiresAt: number;
  model: string;
}

export async function createRealtimeClientSecret(): Promise<RealtimeClientSecret> {
  const apiKey = requireOpenAIApiKey();
  const model =
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe";
  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600
        },
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: {
                model,
                language: "en",
                prompt:
                  "Expect gentle messages to a remembered pet and simple motion requests like sit, come closer, turn around, or look at me."
              },
              noise_reduction: {
                type: "near_field"
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 650
              }
            }
          }
        }
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Realtime client secret request failed with ${response.status}: ${detail}`
    );
  }

  const data = (await response.json()) as {
    value?: string;
    expires_at?: number;
    session?: {
      client_secret?: {
        value?: string;
        expires_at?: number;
      };
    };
  };
  const value = data.value ?? data.session?.client_secret?.value;
  const expiresAt = data.expires_at ?? data.session?.client_secret?.expires_at;

  if (!value || !expiresAt) {
    throw new Error("Realtime client secret response did not include a token.");
  }

  return {
    value,
    expiresAt,
    model
  };
}
