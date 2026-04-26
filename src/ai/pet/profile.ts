import { randomUUID } from "node:crypto";
import type { PetProfile } from "@/types";

export interface PetTraitExtraction {
  sourceCandidateIds?: string[];
  species?: string | null;
  name?: string | null;
  traitSummary?: string | null;
  coatColors?: string[];
  distinctiveMarkings?: string[];
  faceDescription?: string | null;
  bodyDescription?: string | null;
  earDescription?: string | null;
  tailDescription?: string | null;
  sizeDescription?: string | null;
  accessories?: string[];
  breedLikeDescription?: string | null;
  selectionConfidence?: number | null;
  clarificationRequired?: boolean | null;
  clarificationAnswer?: string | null;
}

export function normalizePetProfileFromTraits(
  projectId: string,
  traits: PetTraitExtraction,
  id = randomUUID()
): PetProfile {
  const distinctiveMarkings = cleanTextArray(traits.distinctiveMarkings);
  const accessories = cleanTextArray(traits.accessories);
  const traitSummary =
    cleanText(traits.traitSummary) ??
    buildTraitSummary({
      species: traits.species,
      breedLikeDescription: traits.breedLikeDescription,
      coatColors: traits.coatColors,
      distinctiveMarkings,
      faceDescription: traits.faceDescription,
      bodyDescription: traits.bodyDescription,
      accessories
    });

  return {
    id,
    projectId,
    sourceCandidateIds: cleanTextArray(traits.sourceCandidateIds),
    species: cleanText(traits.species),
    name: cleanText(traits.name),
    traitSummary,
    distinctiveMarkings,
    faceDescription: cleanText(traits.faceDescription),
    bodyDescription: buildBodyDescription(traits),
    accessories,
    selectionConfidence: clamp01(traits.selectionConfidence ?? 0),
    clarificationRequired: Boolean(traits.clarificationRequired),
    clarificationAnswer: cleanText(traits.clarificationAnswer)
  };
}

export function describePetForGeneration(profile: PetProfile): string {
  const clauses = [
    profile.species ? `species: ${profile.species}` : null,
    profile.traitSummary,
    profile.faceDescription ? `face: ${profile.faceDescription}` : null,
    profile.bodyDescription ? `body: ${profile.bodyDescription}` : null,
    profile.distinctiveMarkings.length > 0
      ? `distinctive markings: ${profile.distinctiveMarkings.join("; ")}`
      : null,
    profile.accessories.length > 0
      ? `real accessories visible in source photos: ${profile.accessories.join("; ")}`
      : null
  ].filter(Boolean);

  return clauses.join(". ");
}

function buildTraitSummary(input: {
  species?: string | null;
  breedLikeDescription?: string | null;
  coatColors?: string[];
  distinctiveMarkings?: string[];
  faceDescription?: string | null;
  bodyDescription?: string | null;
  accessories?: string[];
}): string {
  const parts = [
    cleanText(input.species),
    cleanText(input.breedLikeDescription),
    cleanTextArray(input.coatColors).join(" and "),
    cleanText(input.bodyDescription),
    cleanText(input.faceDescription),
    cleanTextArray(input.distinctiveMarkings).join(", "),
    cleanTextArray(input.accessories).join(", ")
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join("; ")
    : "A single selected pet with stable visual traits from the uploaded photos.";
}

function buildBodyDescription(traits: PetTraitExtraction): string | null {
  const parts = [
    cleanText(traits.bodyDescription),
    cleanText(traits.sizeDescription),
    cleanText(traits.earDescription),
    cleanText(traits.tailDescription)
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("; ") : null;
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : null;
}

function cleanTextArray(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values ?? []) {
    const cleaned = cleanText(value);
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      result.push(cleaned);
    }
  }

  return result;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
