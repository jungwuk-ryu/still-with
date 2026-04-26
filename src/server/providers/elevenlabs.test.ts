import { describe, expect, it, vi } from "vitest";
import { createElevenLabsProvider } from "./elevenlabs";

describe("ElevenLabs provider", () => {
  it("composes instrumental music through the Music API", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(input.toString()).toBe(
        "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128"
      );
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe(
        "test-eleven-key"
      );
      expect(JSON.parse(init?.body as string)).toMatchObject({
        prompt: "soft instrumental",
        music_length_ms: 90000,
        model_id: "music_v1",
        force_instrumental: true
      });

      return new Response(new Uint8Array(Buffer.from("music")), {
        headers: {
          "content-type": "audio/mpeg",
          "song-id": "song-1"
        }
      });
    });
    const provider = createElevenLabsProvider({
      apiKey: "test-eleven-key",
      fetchImpl
    });

    const result = await provider.composeMusic({
      prompt: "soft instrumental",
      musicLengthMs: 90_000
    });

    expect(result.audio.toString("utf8")).toBe("music");
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.raw.songId).toBe("song-1");
  });

  it("creates short pet sound effects through the Sound Generation API", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(input.toString()).toBe(
        "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
      );
      expect(JSON.parse(init?.body as string)).toMatchObject({
        text: "soft paws",
        duration_seconds: 1.8,
        loop: false,
        prompt_influence: 0.45,
        model_id: "eleven_text_to_sound_v2"
      });

      return new Response(new Uint8Array(Buffer.from("sfx")), {
        headers: {
          "content-type": "audio/mpeg",
          "character-cost": "9"
        }
      });
    });
    const provider = createElevenLabsProvider({
      apiKey: "test-eleven-key",
      fetchImpl
    });

    const result = await provider.createSoundEffect({
      text: "soft paws",
      durationSeconds: 1.8,
      promptInfluence: 0.45,
      loop: false
    });

    expect(result.audio.toString("utf8")).toBe("sfx");
    expect(result.raw.characterCost).toBe("9");
  });
});
