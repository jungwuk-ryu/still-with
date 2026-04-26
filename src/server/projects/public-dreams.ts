import { getDatabase, type DatabaseClient } from "@/server/db";

export interface PublicDreamSummary {
  projectId: string;
  displayName: string | null;
  title: string;
  href: string;
  thumbnailUrl: string | null;
  completedAt: string | null;
  updatedAt: string;
}

interface PublicDreamRow {
  id: string;
  display_name: string | null;
  completed_at: string | null;
  updated_at: string;
  thumbnail_url: string | null;
  pano_url: string | null;
  seed_image_urls_json: string | null;
}

export function listPublicDreams(
  db: DatabaseClient = getDatabase()
): PublicDreamSummary[] {
  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.display_name,
         p.completed_at,
         p.updated_at,
         wa.thumbnail_url,
         wa.pano_url,
         sc.seed_image_urls_json
       FROM projects p
       LEFT JOIN world_assets wa
         ON wa.id = (
           SELECT id
           FROM world_assets
           WHERE project_id = p.id
           ORDER BY created_at ASC
           LIMIT 1
         )
       LEFT JOIN scene_clusters sc
         ON sc.id = wa.scene_cluster_id
       WHERE p.is_public = 1
         AND p.status = 'ready'
       ORDER BY COALESCE(p.completed_at, p.updated_at) DESC
       LIMIT 48`
    )
    .all() as PublicDreamRow[];

  return rows.map((row) => ({
    projectId: row.id,
    displayName: row.display_name,
    title: getDreamTitle(row.display_name),
    href: `/projects/${row.id}/loading?entry=public`,
    thumbnailUrl:
      row.thumbnail_url ?? row.pano_url ?? getFirstSeedUrl(row.seed_image_urls_json),
    completedAt: row.completed_at,
    updatedAt: row.updated_at
  }));
}

function getDreamTitle(displayName: string | null): string {
  return displayName ? `${getPossessiveName(displayName)} dream` : "A quiet dream";
}

function getPossessiveName(displayName: string): string {
  return displayName.endsWith("s") ? `${displayName}'` : `${displayName}'s`;
}

function getFirstSeedUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && typeof parsed[0] === "string"
      ? parsed[0]
      : null;
  } catch {
    return null;
  }
}
