import type { PetProfile } from "@/types";
import type { MotionIntentKey } from "@/server/conversation/types";

export const BACKGROUND_MUSIC_ASSET_KEY = "background";

export const PET_SOUND_EFFECT_INTENTS = [
  "look_at_me",
  "turn_around",
  "sit",
  "come_closer"
] as const satisfies readonly MotionIntentKey[];

export const REQUIRED_EXPERIENCE_AUDIO_ASSETS = [
  {
    kind: "background_music",
    assetKey: BACKGROUND_MUSIC_ASSET_KEY
  },
  ...PET_SOUND_EFFECT_INTENTS.map((assetKey) => ({
    kind: "pet_sound_effect" as const,
    assetKey
  }))
] as const;

export const BACKGROUND_MUSIC_DURATION_MS = 90_000;
export const PET_SOUND_EFFECT_DURATION_SECONDS = 1.8;

export function buildBackgroundMusicPrompt(input: {
  sceneLabel: string | null;
  spatialPrompt: string | null;
  petProfile: PetProfile;
}): string {
  const sceneContext = [input.sceneLabel, input.spatialPrompt]
    .filter(Boolean)
    .join(". ");
  const petContext = describePet(input.petProfile);

  return [
    "Instrumental only, no vocals, no lyrics.",
    "A calm, gentle background piece for a private memory space about companion-animal loss.",
    "Soft felt piano, warm low strings, airy room tone, and very light ambient texture.",
    "Slow tempo, sparse arrangement, emotionally safe, tender, grounded, not dramatic.",
    "It should sit quietly behind a 3D room and feel natural when looped.",
    sceneContext ? `The room feeling is: ${sceneContext}.` : null,
    petContext ? `The companion animal remembered here: ${petContext}.` : null
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildPetSoundEffectPrompt(input: {
  intent: MotionIntentKey;
  petProfile: PetProfile;
}): string {
  const species = normalizeSpecies(input.petProfile.species);
  const base = getSpeciesSoundBase(species);
  const motion = getIntentSoundDirection(input.intent, species);

  return [
    base,
    motion,
    "Very soft, close, natural, emotionally gentle.",
    "No human voice, no words, no music, no loud bark, no sharp meow, no comedy effect."
  ].join(" ");
}

function describePet(profile: PetProfile): string {
  return [profile.species, profile.traitSummary].filter(Boolean).join(", ");
}

function normalizeSpecies(species: string | null): "cat" | "dog" | "other" {
  const normalized = species?.toLowerCase() ?? "";

  if (normalized.includes("cat")) {
    return "cat";
  }

  if (normalized.includes("dog")) {
    return "dog";
  }

  return "other";
}

function getSpeciesSoundBase(species: "cat" | "dog" | "other"): string {
  switch (species) {
    case "cat":
      return "A quiet cat presence: tiny paw pads on a warm floor, a faint breath, a subtle fabric rustle.";
    case "dog":
      return "A quiet dog presence: soft paw pads on a warm floor, a tiny collar tag, a gentle breath.";
    default:
      return "A quiet companion animal presence: soft paws or small movement on a warm floor, gentle breath, subtle fabric rustle.";
  }
}

function getIntentSoundDirection(
  intent: MotionIntentKey,
  species: "cat" | "dog" | "other"
): string {
  switch (intent) {
    case "come_closer":
      return "One or two small steps moving slightly closer, then settling.";
    case "turn_around":
      return "A small in-place turn with a soft shift of paws.";
    case "sit":
      return species === "dog"
        ? "A gentle sit-down movement with a tiny collar tag and soft body settle."
        : "A gentle sit-down or curl-settle movement with quiet paws and soft body rustle.";
    case "look_at_me":
      return "A tiny head turn, soft breath, and almost silent attentive movement.";
    case "idle":
    default:
      return "A subtle calm movement with gentle breathing.";
  }
}
