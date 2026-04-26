import type { DatabaseClient } from "@/server/db";
import { getDatabase } from "@/server/db";
import type { PetProfile } from "@/types";

interface PetProfileRow {
  id: string;
  project_id: string;
  source_candidate_ids_json: string;
  species: string | null;
  name: string | null;
  trait_summary: string;
  distinctive_markings_json: string;
  face_description: string | null;
  body_description: string | null;
  accessories_json: string;
  selection_confidence: number;
  clarification_required: number;
  clarification_answer: string | null;
}

export function upsertPetProfileRecord(
  profile: PetProfile,
  db: DatabaseClient = getDatabase()
): PetProfile {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO pet_profiles (
      id, project_id, source_candidate_ids_json, species, name, trait_summary,
      distinctive_markings_json, face_description, body_description,
      accessories_json, selection_confidence, clarification_required,
      clarification_answer, created_at, updated_at
    ) VALUES (
      @id, @projectId, @sourceCandidateIdsJson, @species, @name, @traitSummary,
      @distinctiveMarkingsJson, @faceDescription, @bodyDescription,
      @accessoriesJson, @selectionConfidence, @clarificationRequired,
      @clarificationAnswer, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      source_candidate_ids_json = excluded.source_candidate_ids_json,
      species = excluded.species,
      name = excluded.name,
      trait_summary = excluded.trait_summary,
      distinctive_markings_json = excluded.distinctive_markings_json,
      face_description = excluded.face_description,
      body_description = excluded.body_description,
      accessories_json = excluded.accessories_json,
      selection_confidence = excluded.selection_confidence,
      clarification_required = excluded.clarification_required,
      clarification_answer = excluded.clarification_answer,
      updated_at = excluded.updated_at`
  ).run({
    ...profile,
    sourceCandidateIdsJson: JSON.stringify(profile.sourceCandidateIds),
    distinctiveMarkingsJson: JSON.stringify(profile.distinctiveMarkings),
    accessoriesJson: JSON.stringify(profile.accessories),
    clarificationRequired: profile.clarificationRequired ? 1 : 0,
    createdAt: now,
    updatedAt: now
  });

  return profile;
}

export function getPetProfileRecord(
  profileId: string,
  db: DatabaseClient = getDatabase()
): PetProfile | null {
  const row = db
    .prepare("SELECT * FROM pet_profiles WHERE id = ?")
    .get(profileId) as PetProfileRow | undefined;

  return row ? mapPetProfileRow(row) : null;
}

export function getLatestPetProfileForProject(
  projectId: string,
  db: DatabaseClient = getDatabase()
): PetProfile | null {
  const row = db
    .prepare(
      `SELECT * FROM pet_profiles
       WHERE project_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(projectId) as PetProfileRow | undefined;

  return row ? mapPetProfileRow(row) : null;
}

function mapPetProfileRow(row: PetProfileRow): PetProfile {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceCandidateIds: parseStringArray(row.source_candidate_ids_json),
    species: row.species,
    name: row.name,
    traitSummary: row.trait_summary,
    distinctiveMarkings: parseStringArray(row.distinctive_markings_json),
    faceDescription: row.face_description,
    bodyDescription: row.body_description,
    accessories: parseStringArray(row.accessories_json),
    selectionConfidence: row.selection_confidence,
    clarificationRequired: row.clarification_required === 1,
    clarificationAnswer: row.clarification_answer
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
