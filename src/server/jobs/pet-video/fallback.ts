import type { StorageDriver } from "@/server/storage";
import type { PetMotionKey } from "@/pet/motion-set";
import { PET_MOTION_DEFINITIONS } from "@/pet/motion-set";
import type { PetProfile } from "@/types";

export interface FallbackStillAnimationAssetInput {
  projectId: string;
  motionKey: PetMotionKey;
  stillImageUrl: string | null;
  petProfile: PetProfile;
  storage: StorageDriver;
}

export interface FallbackStillAnimationAsset {
  url: string;
  key: string;
  durationMs: number;
  loopable: boolean;
}

export async function createFallbackStillAnimationAsset(
  input: FallbackStillAnimationAssetInput
): Promise<FallbackStillAnimationAsset> {
  const definition = PET_MOTION_DEFINITIONS[input.motionKey];
  const stillImageUrl =
    input.stillImageUrl ?? (await createFallbackPosterAsset(input));
  const key = `projects/${input.projectId}/pet/fallback/${input.motionKey}.json`;
  const manifest = {
    version: 1,
    kind: "fallback-still-animation",
    motionKey: input.motionKey,
    stillImageUrl,
    durationMs: definition.durationMs,
    loopable: definition.loopable,
    transformKeyframes: buildTransformKeyframes(input.motionKey)
  };
  const stored = await input.storage.putObject({
    key,
    body: JSON.stringify(manifest, null, 2),
    contentType: "application/json"
  });

  return {
    url: stored.url,
    key: stored.key,
    durationMs: definition.durationMs,
    loopable: definition.loopable
  };
}

async function createFallbackPosterAsset(
  input: FallbackStillAnimationAssetInput
): Promise<string> {
  const key = `projects/${input.projectId}/pet/fallback/${input.motionKey}-poster.svg`;
  const stored = await input.storage.putObject({
    key,
    body: buildFallbackPosterSvg(input.petProfile),
    contentType: "image/svg+xml"
  });

  return stored.url;
}

function buildFallbackPosterSvg(petProfile: PetProfile): string {
  const species = petProfile.species?.toLowerCase().includes("cat")
    ? "cat"
    : "pet";
  const label = escapeXml(petProfile.traitSummary.slice(0, 96));
  const earPath =
    species === "cat"
      ? '<path d="M430 286 485 205 524 302" fill="#f8f7f2"/><path d="M850 286 795 205 756 302" fill="#f8f7f2"/>'
      : '<ellipse cx="426" cy="306" rx="58" ry="96" fill="#f8f7f2"/><ellipse cx="854" cy="306" rx="58" ry="96" fill="#f8f7f2"/>';

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">',
    '<rect width="1280" height="720" fill="#00ff00"/>',
    '<g transform="translate(0 8)">',
    '<ellipse cx="640" cy="454" rx="286" ry="142" fill="#f8f7f2"/>',
    '<circle cx="640" cy="326" r="138" fill="#f8f7f2"/>',
    earPath,
    '<circle cx="590" cy="318" r="16" fill="#1f2224"/>',
    '<circle cx="690" cy="318" r="16" fill="#1f2224"/>',
    '<path d="M612 364 Q640 388 668 364" stroke="#1f2224" stroke-width="12" fill="none" stroke-linecap="round"/>',
    '<path d="M422 454 q-52 28-77 88" stroke="#f8f7f2" stroke-width="44" fill="none" stroke-linecap="round"/>',
    '<path d="M858 454 q58 24 96 80" stroke="#f8f7f2" stroke-width="44" fill="none" stroke-linecap="round"/>',
    '<path d="M492 566 v70M598 582 v70M708 582 v70M808 566 v70" stroke="#f8f7f2" stroke-width="42" stroke-linecap="round"/>',
    '</g>',
    `<desc>${label}</desc>`,
    '</svg>'
  ].join("");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildTransformKeyframes(motionKey: PetMotionKey): Array<{
  offset: number;
  transform: string;
  opacity?: number;
}> {
  switch (motionKey) {
    case "sit_to_stand":
      return [
        { offset: 0, transform: "translateY(5%) scaleY(0.94)" },
        { offset: 0.7, transform: "translateY(0) scaleY(1.02)" },
        { offset: 1, transform: "translateY(0) scaleY(1)" }
      ];
    case "stand_to_sit":
      return [
        { offset: 0, transform: "translateY(0) scaleY(1)" },
        { offset: 1, transform: "translateY(5%) scaleY(0.94)" }
      ];
    case "turn_360":
      return [
        { offset: 0, transform: "scaleX(1)" },
        { offset: 0.25, transform: "scaleX(0.18)" },
        { offset: 0.5, transform: "scaleX(-1)" },
        { offset: 0.75, transform: "scaleX(-0.18)" },
        { offset: 1, transform: "scaleX(1)" }
      ];
    case "look_at_camera":
      return [
        { offset: 0, transform: "rotate(-1deg)" },
        { offset: 0.45, transform: "rotate(2deg) translateY(-1%)" },
        { offset: 1, transform: "rotate(0deg)" }
      ];
    case "walk_small":
      return [
        { offset: 0, transform: "translateX(-2%) translateY(0)" },
        { offset: 0.5, transform: "translateX(3%) translateY(-1%)" },
        { offset: 1, transform: "translateX(0) translateY(0)" }
      ];
    case "sit":
    case "stand_idle":
    default:
      return [
        { offset: 0, transform: "translateY(0) scale(1)" },
        { offset: 0.5, transform: "translateY(-0.8%) scale(1.01)" },
        { offset: 1, transform: "translateY(0) scale(1)" }
      ];
  }
}
