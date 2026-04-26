import type { PetProfile } from "@/types";
import { chooseChromaKeyColor, type ChromaKeyColor } from "@/ai/pet";

export interface ChromaAlphaProcessInput {
  rawVideoUrl: string | null;
  keyframeImageUrls: readonly string[];
  petProfile: PetProfile;
}

export interface ChromaAlphaProcessResult {
  processedVideoUrl: string | null;
  alphaVideoUrl: string | null;
  chromaKeyColor: ChromaKeyColor;
  strategy: "shader-chroma-key" | "fallback-still";
  shaderUniforms: {
    keyColor: [number, number, number];
    similarity: number;
    smoothness: number;
    spill: number;
  };
}

export function processChromaAlpha(
  input: ChromaAlphaProcessInput
): ChromaAlphaProcessResult {
  const chromaKeyColor = chooseChromaKeyColor(input.petProfile);
  const shaderUniforms = buildShaderUniforms(chromaKeyColor);

  if (!input.rawVideoUrl) {
    return {
      processedVideoUrl: input.keyframeImageUrls[0] ?? null,
      alphaVideoUrl: null,
      chromaKeyColor,
      strategy: "fallback-still",
      shaderUniforms
    };
  }

  return {
    processedVideoUrl: input.rawVideoUrl,
    alphaVideoUrl: null,
    chromaKeyColor,
    strategy: "shader-chroma-key",
    shaderUniforms
  };
}

function buildShaderUniforms(
  chromaKeyColor: ChromaKeyColor
): ChromaAlphaProcessResult["shaderUniforms"] {
  return chromaKeyColor === "green"
    ? {
        keyColor: [0, 1, 0],
        similarity: 0.34,
        smoothness: 0.08,
        spill: 0.12
      }
    : {
        keyColor: [0, 0.28, 1],
        similarity: 0.32,
        smoothness: 0.08,
        spill: 0.1
      };
}
