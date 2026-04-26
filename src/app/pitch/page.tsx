import Link from "next/link";
import type { Metadata } from "next";

import { BrandMark } from "@/components/brand/BrandMark";

export const metadata: Metadata = {
  title: "Still With - Pitch Deck",
  description:
    "Still With의 문제 정의, 제품 흐름, 기술 구조를 정리한 한국어 피치 덱."
};

const productFlow = [
  {
    step: "01",
    title: "사진 업로드",
    detail:
      "사용자는 반려동물과 공간 사진을 올리고, 이름과 공개 여부를 선택합니다."
  },
  {
    step: "02",
    title: "AI 이해",
    detail:
      "Gemini와 OpenAI 기반 분석으로 반려동물의 시각적 특징, 성격 단서, 공간 맥락을 구조화합니다."
  },
  {
    step: "03",
    title: "공간 생성",
    detail:
      "World Labs, 이미지 생성, 비디오 생성, ElevenLabs 오디오 작업이 job pipeline 안에서 순차적으로 진행됩니다."
  },
  {
    step: "04",
    title: "경험 진입",
    detail:
      "완성된 3D 공간에서 반려동물의 움직임, 배경음, 상황별 효과음, 다른 공간 전환을 제공합니다."
  }
];

const architecturePoints = [
  "Next.js App Router가 화면과 API boundary를 함께 관리합니다.",
  "SQLite와 로컬 스토리지를 기본 런타임으로 사용해 MVP 운영 복잡도를 낮춥니다.",
  "Provider adapter가 OpenAI, Gemini, World Labs, Veo, ElevenLabs 호출을 서버 안에 격리합니다.",
  "Generation job worker가 실패, 재시도, 상태 업데이트를 한 흐름으로 처리합니다."
];

const safetyPoints = [
  "업로드는 즉시 프로젝트로 이어지고, 이후 분석 단계에서 필요한 확인과 보완을 진행합니다.",
  "문구는 부활, 의식, 사후 세계를 암시하지 않고 기억 공간으로만 표현합니다.",
  "사용자 사진과 생성물은 기본적으로 비공개이며, 공개는 사용자가 선택한 경우에만 이뤄집니다.",
  "기존 프로젝트도 스페이스 접속 시 필요한 보조 생성물을 lazy backfill하도록 설계합니다."
];

const demoPlan = [
  "기존 ready 프로젝트에서 dream fragment lazy backfill 안정화",
  "공유 버튼과 주소 복사 다이얼로그로 데모 전달성 강화",
  "생성 단계별 로그와 재시도 정책으로 운영 가시성 확보",
  "품질 검증과 프롬프트 평가를 추가해 provider 편차 축소"
];

export default function PitchPage() {
  return (
    <main className="app-shell pitch-shell">
      <nav className="top-nav" aria-label="Primary">
        <BrandMark />
        <div className="nav-actions">
          <Link className="nav-pill" href="/">
            Home
          </Link>
          <Link className="nav-pill" href="/projects">
            Dreams
          </Link>
        </div>
      </nav>

      <section className="pitch-deck" aria-label="Still With pitch deck">
        <article className="pitch-slide pitch-slide-cover" aria-labelledby="pitch-title">
          <div className="pitch-slide-kicker">Still With</div>
          <div className="pitch-cover-copy">
            <p className="eyebrow">한국어 피치 덱</p>
            <h1 id="pitch-title">
              반려동물과의 기억을 조용히 머무를 수 있는 공간으로
            </h1>
            <p>
              Still With는 사진 몇 장에서 출발해, 반려동물의 모습과 그들이 머물던
              공간을 부드러운 3D 기억 경험으로 구성하는 제품입니다.
            </p>
          </div>
          <div className="pitch-cover-metrics" aria-label="Product highlights">
            <span>Private-first</span>
            <span>AI media pipeline</span>
            <span>Gentle memory space</span>
          </div>
        </article>

        <article className="pitch-slide" id="problem">
          <div className="pitch-slide-header">
            <p className="pitch-number">01</p>
            <p className="eyebrow">Problem</p>
          </div>
          <div className="pitch-two-column">
            <div>
              <h2 className="pitch-slide-title">기억은 많은데, 머무를 공간은 없다.</h2>
              <p className="pitch-paragraph">
                반려동물을 떠나보낸 뒤 남는 사진은 흩어져 있고, 장소와 감정의 맥락은
                시간이 지날수록 분리됩니다. 사용자는 복잡한 편집툴이 아니라 조용히
                정리된 공간을 원합니다.
              </p>
            </div>
            <ul className="pitch-list pitch-callouts">
              <li>사진, 장소, 행동의 맥락이 따로 흩어짐</li>
              <li>수동 영상 편집은 감정적 부담이 큼</li>
              <li>AI 결과물이 일반적이면 개인적 의미가 약해짐</li>
            </ul>
          </div>
        </article>

        <article className="pitch-slide" id="solution">
          <div className="pitch-slide-header">
            <p className="pitch-number">02</p>
            <p className="eyebrow">Solution</p>
          </div>
          <h2 className="pitch-slide-title">짧은 업로드에서 완성된 기억 공간까지.</h2>
          <div className="pitch-flow-grid">
            {productFlow.map((item) => (
              <section className="pitch-flow-card" key={item.step}>
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </section>
            ))}
          </div>
        </article>

        <article className="pitch-slide" id="architecture">
          <div className="pitch-slide-header">
            <p className="pitch-number">03</p>
            <p className="eyebrow">Architecture</p>
          </div>
          <div className="pitch-two-column">
            <div>
              <h2 className="pitch-slide-title">MVP에 맞춘 단순한 생성 오케스트레이션.</h2>
              <p className="pitch-paragraph">
                복잡한 인프라를 늘리지 않고, Next.js API와 in-process worker가
                provider 호출과 상태 전환을 관리합니다. 모든 provider 세부 정보와
                API key는 서버 안에 머뭅니다.
              </p>
              <pre className="pitch-code">
                <code>{`POST /api/projects
  -> upload validation
  -> project + jobs

GET /api/projects/{id}/space
  -> manifest, audio, motion, world assets

GET /api/projects/{id}/dream-fragments
  -> lazy backfill + generation job`}</code>
              </pre>
            </div>
            <ul className="pitch-list pitch-list-muted">
              {architecturePoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>

        <article className="pitch-slide" id="safety">
          <div className="pitch-slide-header">
            <p className="pitch-number">04</p>
            <p className="eyebrow">Safety</p>
          </div>
          <h2 className="pitch-slide-title">정서적으로 안전한 제품 흐름.</h2>
          <ul className="pitch-list pitch-safety-grid">
            {safetyPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="pitch-slide" id="roadmap">
          <div className="pitch-slide-header">
            <p className="pitch-number">05</p>
            <p className="eyebrow">Next</p>
          </div>
          <div className="pitch-two-column">
            <div>
              <h2 className="pitch-slide-title">데모 완성도를 높이는 다음 작업.</h2>
              <p className="pitch-paragraph">
                지금 단계의 목표는 더 많은 기능보다, 생성물이 안정적으로 만들어지고
                사용자가 이해할 수 있는 상태로 전달되는 것입니다.
              </p>
            </div>
            <ol className="pitch-flow pitch-roadmap">
              {demoPlan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </article>
      </section>
    </main>
  );
}
