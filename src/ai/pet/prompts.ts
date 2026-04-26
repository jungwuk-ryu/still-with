import type { PetProfile } from "@/types";
import { describePetForGeneration } from "./profile";
import {
  PET_MOTION_DEFINITIONS,
  type PetMotionKey
} from "@/pet/motion-set";

export type ChromaKeyColor = "green" | "blue";

export interface PetIdentityPromptInput {
  imageCount: number;
  clarificationAnswer?: string | null;
}

export interface PetKeyframePromptInput {
  petProfile: PetProfile;
  motionKey: PetMotionKey;
  chromaKeyColor?: ChromaKeyColor;
}

export function buildPetIdentityAnalysisPrompt(
  input: PetIdentityPromptInput
): string {
  const clarification = input.clarificationAnswer
    ? `User clarification: ${input.clarificationAnswer}`
    : "No user clarification has been provided.";

  return [
    "Analyze the uploaded pet photos and return structured JSON only.",
    `Image count: ${input.imageCount}.`,
    clarification,
    "Detect every visible pet candidate in every image.",
    "Cluster candidates that appear to be the same individual pet.",
    "Select the dominant pet when one pet appears clearly more often or is visually dominant.",
    "If the target pet is ambiguous, set clarificationRequired to true and ask for a visual detail only.",
    "Extract stable visual traits for the selected pet: species, breed-like description, coat colors, distinctive markings, face shape, ear shape, tail, body size, and real accessories such as a collar only if visible.",
    "Do not include emotional backstory or invented memories.",
    "Return JSON with petCandidates, identityClusters, selectedClusterId, selectionConfidence, clarificationRequired, clarificationPrompt, and petTraitSummary."
  ].join("\n");
}

export function chooseChromaKeyColor(profile: PetProfile): ChromaKeyColor {
  const text = [
    profile.traitSummary,
    profile.bodyDescription,
    profile.faceDescription,
    ...profile.distinctiveMarkings,
    ...profile.accessories
  ]
    .join(" ")
    .toLowerCase();

  return /\b(green|lime|teal|turquoise)\b/.test(text) ? "blue" : "green";
}

export function buildPetKeyframePrompt(input: PetKeyframePromptInput): string {
  const definition = PET_MOTION_DEFINITIONS[input.motionKey];
  const chromaKeyColor =
    input.chromaKeyColor ?? chooseChromaKeyColor(input.petProfile);
  const chromaPhrase =
    chromaKeyColor === "green"
      ? "solid chroma key green (#00ff00)"
      : "solid chroma key blue (#0047ff)";

  return [
    "Create a clean full-body keyframe image for one selected pet only.",
    `Pet identity: ${describePetForGeneration(input.petProfile)}`,
    `Motion key: ${definition.key}.`,
    `Pose/action: ${definition.description}`,
    `The pet starts in ${definition.fromState} and should read clearly as ending in ${definition.toState}.`,
    `Background: ${chromaPhrase}, perfectly flat, evenly lit, no shadows outside the pet contact shadow.`,
    "Composition: one pet centered, full body visible, camera at pet eye level, neutral lens, no crop.",
    "Lighting: soft studio lighting that preserves fur texture and facial markings.",
    "Strict exclusions: no people, no other animals, no props, no furniture, no toys, no text, no complex background, no duplicate pets, no extra limbs.",
    "Keep the selected pet's markings, body shape, face, ears, tail, and real visible collar/accessory consistent with the source trait summary.",
    "Do not request or rely on transparent background; the chroma background is intentional for post-processing."
  ].join("\n");
}

export function buildSoraMotionPrompt(input: PetKeyframePromptInput): string {
  const definition = PET_MOTION_DEFINITIONS[input.motionKey];
  const chromaKeyColor =
    input.chromaKeyColor ?? chooseChromaKeyColor(input.petProfile);
  const chromaPhrase =
    chromaKeyColor === "green"
      ? "flat chroma key green background"
      : "flat chroma key blue background";

  return [
    `Generate a short ${Math.round(definition.durationMs / 1000)} second pet-only motion clip.`,
    `Pet identity: ${describePetForGeneration(input.petProfile)}`,
    `Required motion: ${definition.description}`,
    `State transition: ${definition.fromState} to ${definition.toState}.`,
    `Background must remain a uniform ${chromaPhrase} for alpha/chroma processing.`,
    "The frame contains exactly one animal: the selected pet. No people, no other animals, no props, no furniture, no scenic elements, no complex background.",
    "Keep the camera locked off, full body visible, no cuts, no zooms, no scene change.",
    "Preserve coat colors, markings, face shape, ears, tail, size, and visible real collar/accessory.",
    definition.loopable
      ? "Make the motion loop smoothly with subtle breathing and no jump at the loop point."
      : "End in a stable pose that can transition into stand_idle or sit idle without a visual jump."
  ].join("\n");
}
