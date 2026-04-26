import { randomUUID } from "node:crypto";
import { getDatabase, getProjectRecord, type DatabaseClient } from "@/server/db";
import {
  getSceneClusterRecord,
  getUploadedImagesByIds
} from "@/server/assets/world-assets";
import { createGenerationJob } from "@/server/jobs/repository";

const MAX_DREAM_FRAGMENTS = 2;

type DreamFragmentStatus = "queued" | "generating" | "ready" | "failed";

interface DreamFragmentRow {
  id: string;
  project_id: string;
  scene_cluster_id: string;
  source_image_id: string;
  source_image_url: string;
  image_url: string | null;
  prompt: string;
  status: DreamFragmentStatus;
  provider_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DreamFragment {
  id: string;
  projectId: string;
  sceneClusterId: string;
  sourceImageId: string;
  sourceImageUrl: string;
  imageUrl: string | null;
  status: DreamFragmentStatus;
  providerErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DreamFragmentsResult {
  fragments: DreamFragment[];
  pending: boolean;
}

export function ensureDreamFragmentsForSpace(
  projectId: string,
  sceneClusterId: string,
  db: DatabaseClient = getDatabase()
): DreamFragmentsResult {
  ensureDreamFragmentsTable(db);

  const project = getProjectRecord(projectId, db);
  const sceneCluster = getSceneClusterRecord(sceneClusterId, db);

  if (!project || !sceneCluster || sceneCluster.projectId !== projectId) {
    return { fragments: [], pending: false };
  }

  const sourceImageIds = getDreamFragmentSourceImageIds(sceneCluster);
  const uploadedImages = getUploadedImagesByIds(projectId, sourceImageIds, db);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO dream_fragments (
      id, project_id, scene_cluster_id, source_image_id, source_image_url,
      image_url, prompt, status, provider_error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'queued', NULL, ?, ?)`
  );

  for (const image of uploadedImages.slice(0, MAX_DREAM_FRAGMENTS)) {
    insert.run(
      randomUUID(),
      projectId,
      sceneClusterId,
      image.id,
      image.originalUrl,
      DREAM_FRAGMENT_PROMPT,
      now,
      now
    );
  }

  const fragments = listDreamFragmentsForSpace(projectId, sceneClusterId, db);
  const needsGeneration = fragments.some((fragment) =>
    fragment.status === "queued" || fragment.status === "failed"
  );

  if (needsGeneration && !hasActiveDreamFragmentJob(projectId, sceneClusterId, db)) {
    createGenerationJob(
      {
        projectId,
        type: "dream-fragment",
        payload: { sceneClusterId },
        priority: 2,
        maxAttempts: 2
      },
      db
    );
  }

  return {
    fragments,
    pending: fragments.some((fragment) => fragment.status !== "ready")
  };
}

export function listDreamFragmentsForSpace(
  projectId: string,
  sceneClusterId: string,
  db: DatabaseClient = getDatabase()
): DreamFragment[] {
  ensureDreamFragmentsTable(db);
  const rows = db
    .prepare(
      `SELECT *
       FROM dream_fragments
       WHERE project_id = ? AND scene_cluster_id = ?
       ORDER BY created_at ASC
       LIMIT ${MAX_DREAM_FRAGMENTS}`
    )
    .all(projectId, sceneClusterId) as DreamFragmentRow[];

  return rows.map(mapDreamFragmentRow);
}

export function claimDreamFragmentsForGeneration(
  projectId: string,
  sceneClusterId: string,
  db: DatabaseClient = getDatabase()
): DreamFragment[] {
  ensureDreamFragmentsTable(db);
  const rows = db
    .prepare(
      `SELECT *
       FROM dream_fragments
       WHERE project_id = ?
         AND scene_cluster_id = ?
         AND status IN ('queued', 'failed')
       ORDER BY created_at ASC
       LIMIT ${MAX_DREAM_FRAGMENTS}`
    )
    .all(projectId, sceneClusterId) as DreamFragmentRow[];
  const now = new Date().toISOString();

  for (const row of rows) {
    db.prepare(
      `UPDATE dream_fragments
       SET status = 'generating', provider_error_message = NULL, updated_at = ?
       WHERE id = ?`
    ).run(now, row.id);
  }

  return rows.map(mapDreamFragmentRow);
}

export function markDreamFragmentReady(
  fragmentId: string,
  imageUrl: string,
  db: DatabaseClient = getDatabase()
): void {
  ensureDreamFragmentsTable(db);
  db.prepare(
    `UPDATE dream_fragments
     SET image_url = ?, status = 'ready', provider_error_message = NULL, updated_at = ?
     WHERE id = ?`
  ).run(imageUrl, new Date().toISOString(), fragmentId);
}

export function markDreamFragmentFailed(
  fragmentId: string,
  errorMessage: string,
  db: DatabaseClient = getDatabase()
): void {
  ensureDreamFragmentsTable(db);
  db.prepare(
    `UPDATE dream_fragments
     SET status = 'failed', provider_error_message = ?, updated_at = ?
     WHERE id = ?`
  ).run(errorMessage.slice(0, 500), new Date().toISOString(), fragmentId);
}

export function ensureDreamFragmentsTable(db: DatabaseClient = getDatabase()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dream_fragments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scene_cluster_id TEXT NOT NULL,
      source_image_id TEXT NOT NULL,
      source_image_url TEXT NOT NULL,
      image_url TEXT,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(scene_cluster_id) REFERENCES scene_clusters(id) ON DELETE CASCADE,
      FOREIGN KEY(source_image_id) REFERENCES uploaded_images(id) ON DELETE CASCADE,
      UNIQUE(project_id, scene_cluster_id, source_image_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dream_fragments_space
      ON dream_fragments(project_id, scene_cluster_id, status);
  `);
}

function getDreamFragmentSourceImageIds(sceneCluster: {
  representativeImageIds: string[];
  sourceImageIds: string[];
}): string[] {
  return [
    ...new Set([
      ...sceneCluster.representativeImageIds,
      ...sceneCluster.sourceImageIds
    ])
  ].slice(0, MAX_DREAM_FRAGMENTS);
}

function hasActiveDreamFragmentJob(
  projectId: string,
  sceneClusterId: string,
  db: DatabaseClient
): boolean {
  const rows = db
    .prepare(
      `SELECT payload_json
       FROM generation_jobs
       WHERE project_id = ?
         AND type = 'dream-fragment'
         AND status IN ('queued', 'retrying', 'running')`
    )
    .all(projectId) as Array<{ payload_json: string }>;

  return rows.some((row) => {
    try {
      const payload = JSON.parse(row.payload_json) as { sceneClusterId?: unknown };
      return payload.sceneClusterId === sceneClusterId;
    } catch {
      return false;
    }
  });
}

function mapDreamFragmentRow(row: DreamFragmentRow): DreamFragment {
  return {
    id: row.id,
    projectId: row.project_id,
    sceneClusterId: row.scene_cluster_id,
    sourceImageId: row.source_image_id,
    sourceImageUrl: row.source_image_url,
    imageUrl: row.image_url,
    status: row.status,
    providerErrorMessage: row.provider_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const DREAM_FRAGMENT_PROMPT = `"""[컨셉]
전체적인 분위기는 따뜻하고 몽환적인 ‘감성 인스타 스토리’ 또는 ‘반려동물 포토 다이어리’ 페이지처럼 연출해줘.
사진의 여백을 살려, 이 장면을 보면서 바로 느낀 감정을 흰색 손글씨 메모로 적어둔 것처럼 표현해줘.
전체 무드는 밝고 포근하며, 추억 회상이나 이별의 감정보다는 “지금 이 사진이 너무 좋다”, “이 장면이 너무 사랑스럽다” 같은 현재형 감정이 느껴지게 해줘.

[드로잉 규칙]
펜 스타일: 얇은 흰색 펜으로 직접 손으로 쓴 듯한 느낌. 자연스럽고 살짝 삐뚤삐뚤한 선.
라인: 사진 속 주요 반려동물, 표정, 자세, 공간 요소(예: 소파, 침대, 창가, 산책길, 장난감 등)의 외곽이나 포인트를 따라 얇은 흰색 테두리 또는 강조선을 추가.
유도: 화살표나 부드러운 곡선 점선으로 시선을 반려동물의 얼굴, 자세, 시선, 혹은 공간의 예쁜 포인트로 자연스럽게 유도.
장식: 작은 하트(♡), 반짝이(✨), 별, 구름, 햇살선, 동그라미 강조선 등을 과하지 않게 배치.
분위기 강조: 낙서처럼 지저분하지 않게, 감성적이고 세련된 편집 디자인처럼 표현.

[텍스트 규칙]
언어: 한국어(한글) 손글씨체.
말투: 짧고 자연스러운 혼잣말. 사진을 보자마자 바로 적은 듯한 다정하고 귀여운 톤.
시점: 반드시 현재형 중심. 회상, 추억, 작별, 위로, 상실을 직접적으로 말하지 말 것.
금지 표현: “다시 만나자”, “보고 싶다”, “기억”, “추억”, “여전히”, “마음 속에”, “남아 있어”, “그리워”, “함께한 시간”, “언젠가”, “천국”, “위로” 같은 회상성·이별성 문구는 사용하지 말 것.

내용 구성:
반려동물:
- 외형, 표정, 자세, 분위기를 지금 보고 느끼는 감탄처럼 표현
- 예: "이 표정 진짜 너무 귀여워", "앉아 있는 것도 왜 이렇게 사랑스럽지", "동글동글한 뒤태 너무 최고야", "가만히 보고만 있어도 좋다"

행동/상태:
- 순간의 움직임이나 분위기를 생생하게 표현
- 예: "금방이라도 쪼르르 올 것 같아", "장난기 가득한 얼굴이네", "이 자세 완전 시그니처다", "편안해 보여서 나까지 좋다"

공간/분위기:
- 장소와 공기의 느낌을 지금 눈앞에 있는 것처럼 표현
- 예: "햇살이랑 너무 잘 어울려", "이 자리 분위기 진짜 좋다", "이 길도, 이 공기도 다 너랑 있어서 너무 좋아", "여기 있으니까 화면이 다 따뜻해 보여"

한 줄 총평:
- 현재형의 짧고 사랑스러운 감탄으로 마무리
- 예: "오늘 사진 느낌 완전 최고 ♡", "그냥 너무 좋다", "귀여움이 화면 밖으로 넘친다", "이 장면 오래 보고 싶어"

[스타일 가이드]
텍스트는 짧고 간결하게, 사진의 여백을 살려 배치해줘.
사진을 가리지 않도록 세련되게 구성하고, 반려동물의 표정·자세·공간의 분위기가 자연스럽게 강조되도록 해줘.
전체적으로 슬픈 감성이나 회상형 문체는 피하고, 지금 사진을 보며 느끼는 사랑스러운 감탄과 따뜻한 분위기에 집중해줘.

[최종 요청]
이 사진 속 반려동물과 공간, 분위기를 분석해서 위 규칙에 맞는 흰색 손글씨 메모와 감성적인 드로잉 요소를 추가해줘.
반드시 현재형의 자연스러운 감탄 문장으로 작성하고, 회상·이별·추모처럼 느껴지는 표현은 제외해줘.
결과물은 밝고 포근하며, 사진을 보며 “지금 너무 좋다”라고 느끼는 감정이 자연스럽게 전달되도록 완성해줘."""`;
