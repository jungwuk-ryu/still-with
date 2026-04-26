# Agent Prompts

이 문서는 Still With 프로젝트를 여러 AI 에이전트가 git worktree에서 병렬 작업할 때 사용할 복붙용 프롬프트 모음입니다.

공통 전제:

- 반드시 `PRD.md`, `DESIGN.md`, `AGENT_WORKTREE_PLAN.md`를 먼저 읽고 작업한다.
- 사용자-facing 웹 UI 문구는 모두 영어로 작성한다.
- 설명/보고는 한국어로 해도 된다.
- `.env`는 절대 커밋하지 않는다.
- API key 값은 절대 출력하지 않는다.
- DB는 SQLite flat-file만 사용한다.
- Postgres, MySQL, Redis, BullMQ 등 별도 설치 서비스는 도입하지 않는다.
- 파일 저장소는 로컬 filesystem 기본값을 사용한다.
- 다른 에이전트가 병렬로 작업 중이라고 가정하고, 본인 소유 범위 밖의 파일은 가능한 건드리지 않는다.

---

## 0. Foundation Agent Prompt

```text
너는 Still With 프로젝트의 Foundation Agent다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-foundation

브랜치:
codex/foundation-shell

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.

목표:
아직 docs-only 상태인 프로젝트를 실제 구현 가능한 Next.js TypeScript 앱으로 부트스트랩한다. 이후 4명의 feature agent가 병렬로 작업할 수 있도록 폴더 구조, shared types, SQLite DB, local storage, job abstraction, provider interfaces, route shell을 안정적으로 만든다.

반드시 지킬 것:
- 사용자-facing UI 문구는 영어만 사용한다.
- SQLite flat-file DB를 기본으로 한다. 기본 경로는 ./data/still-with.sqlite.
- local filesystem storage를 기본으로 한다. 기본 경로는 ./data/uploads.
- Redis, Postgres, MySQL, BullMQ, 외부 DB 서비스를 추가하지 않는다.
- .env를 커밋하지 않는다.
- OPENAI_API_KEY, WORLDLABS_API_KEY는 provider 호출 시에만 검증한다.

주요 소유 범위:
- package.json
- next.config.*
- tsconfig.json
- src/app/**
- src/styles/**
- src/types/**
- src/lib/env/**
- src/server/db/**
- src/server/storage/**
- src/server/jobs/**
- src/server/providers/**

구현해야 할 것:
- Next.js + TypeScript 앱 scaffold
- lint/typecheck/test script
- DESIGN.md 기반 global style/design token
- upload/loading/clarify/space route shell
- shared types: Project, UploadedImage, PetProfile, SceneCluster, WorldAsset, MotionClip, PetRuntimeState, GenerationJob, ProjectStatus
- SQLite schema/init helper
- SQLite-backed GenerationJob table
- in-process worker abstraction
- local storage abstraction
- OpenAI, World Labs, Sora provider interface stub
- .env.example

완료 전 실행:
- npm install 또는 선택한 패키지 매니저 install
- typecheck
- test가 있으면 test
- app이 dev server로 뜨는지 확인

최종 보고에는 다음을 포함해라:
- 변경 파일 목록
- 실행한 명령
- 남은 blocker
- feature agent들이 알아야 할 shared contract
- dependency 변경사항
```

---

## 1. Intake / Pet Selection / Loading Agent Prompt

```text
너는 Still With 프로젝트의 Intake Agent다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-intake

브랜치:
codex/intake-selection

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.
Foundation branch가 codex/integration에 merge된 뒤 이 작업을 시작한다고 가정한다.

목표:
사용자가 사진을 업로드하고, 반려동물을 선택/확정하며, 감성적인 loading 화면에서 생성 진행을 기다릴 수 있는 intake flow를 구현한다.

반드시 지킬 것:
- 모든 사용자-facing UI 문구는 영어로 작성한다.
- 로딩 화면은 기술 파이프라인 대시보드가 아니라 조용한 감정적 threshold여야 한다.
- primary loading UI에는 percent counter, model name, API name, raw job id를 보여주지 않는다.
- 로딩 title은 "A quiet place is being prepared".
- subtitle은 "We're taking a little time to make this feel gentle, familiar, and safe."
- "Step N of 7" 형태의 단계 표시는 허용한다.
- "Generating your pet", "Creating AI companion", "Your pet is almost ready" 같은 문구는 금지한다.
- .env를 커밋하거나 key 값을 출력하지 않는다.

주요 소유 범위:
- src/app/page.*
- src/app/projects/[projectId]/loading/**
- src/app/projects/[projectId]/clarify/**
- src/app/api/projects/**
- src/components/upload/**
- src/components/loading/**
- src/components/clarification/**
- src/server/projects/**

구현해야 할 것:
- upload UI
- image preview/remove/validation
- POST /api/projects
- local storage를 통한 이미지 저장
- Project/UploadedImage 생성
- pet clarification UI
- project status lifecycle
- loading stage mapping
- gentle retry/backoff display
- SSE 또는 polling 기반 status UI

다른 영역을 건드리지 말 것:
- World Labs provider 구현
- pet video/chroma 구현
- Three.js/Spark renderer

완료 전 실행:
- typecheck
- 관련 test
- upload -> loading -> clarify route smoke check

최종 보고에는 다음을 포함해라:
- 변경 파일 목록
- 실행한 명령
- 남은 blocker
- Space/Pet/Experience agent가 소비해야 할 project status contract
- dependency 변경사항
```

---

## 2. Space Pipeline Agent Prompt

```text
너는 Still With 프로젝트의 Space Pipeline Agent다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-space

브랜치:
codex/space-pipeline

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.
Foundation이 codex/integration에 merge된 뒤 작업한다고 가정한다.

목표:
업로드된 사진에서 기억 공간을 분류하고, 필요하면 gpt-image-2로 공간 seed image를 만든 뒤, World Labs Marble API로 3D memory space asset을 생성/조회/저장한다.

반드시 지킬 것:
- DB는 SQLite만 사용한다.
- World Labs API key 값은 출력하지 않는다.
- 공간 seed image에는 pet, people, other animals가 없어야 한다.
- gpt-image-2로 상하 이미지를 기본 생성하지 않는다. 필요한 경우 front/left/right/back 또는 panorama 전략을 사용한다.
- World Labs 결과물은 SPZ tier, collider mesh, panorama, thumbnail manifest로 저장한다.
- 사용자-facing 문구를 추가해야 한다면 영어로 작성한다.

주요 소유 범위:
- src/ai/scene/**
- src/world/**
- src/server/providers/worldlabs/**
- src/server/jobs/scene-classification/**
- src/server/jobs/space-seeds/**
- src/server/jobs/worldlabs/**
- src/server/assets/world-assets/**

구현해야 할 것:
- scene classification job
- place label / representative image selection
- scene seed prompt planning
- gpt-image-2 scene seed generation hook 또는 adapter call
- World Labs generate request
- World Labs operation polling
- completed world fetch
- WorldAsset manifest persistence
- panorama/thumbnail fallback
- retry/backoff handling

다른 영역을 건드리지 말 것:
- upload/clarification UI
- pet motion state machine
- Three.js renderer internals

완료 전 실행:
- typecheck
- provider client unit test 또는 mocked integration test
- WorldAsset manifest 생성 테스트

최종 보고에는 다음을 포함해라:
- 변경 파일 목록
- 실행한 명령
- 남은 blocker
- Experience agent가 사용할 WorldAsset manifest shape
- 실제 World Labs 호출 여부와 결과
- dependency 변경사항
```

---

## 3. Pet Media / Motion State Agent Prompt

```text
너는 Still With 프로젝트의 Pet Media and State Agent다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-pet

브랜치:
codex/pet-media-state

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.
Foundation이 codex/integration에 merge된 뒤 작업한다고 가정한다.

목표:
선택된 반려동물의 특징을 바탕으로 keyframe, Sora-first motion clip, chroma/alpha processing, quality evaluation, pet runtime state machine을 구현한다.

반드시 지킬 것:
- 생성 이미지/영상에는 선택된 pet 한 마리만 있어야 한다.
- people, other animals, props, complex background는 금지한다.
- gpt-image-2는 transparent background를 보장하지 않으므로 chroma green/blue + postprocess 또는 shader fallback을 사용한다.
- Sora가 안 되면 static/fallback animation으로 demo가 계속 가능해야 한다.
- state transition은 반드시 stand를 hub로 사용한다.
- 예: sit 상태에서 "turn around"는 sit_to_stand -> turn_360 -> stand_idle 순서여야 한다.
- .env와 key 값을 절대 노출하지 않는다.

주요 소유 범위:
- src/ai/pet/**
- src/pet/**
- src/server/providers/openai/**
- src/server/providers/sora/**
- src/server/jobs/pet-analysis/**
- src/server/jobs/pet-keyframes/**
- src/server/jobs/pet-video/**
- src/server/jobs/video-postprocess/**
- src/server/jobs/quality-evaluation/**
- src/server/motion/**

구현해야 할 것:
- PetProfile trait extraction 보강
- gpt-image-2 keyframe prompt
- required motion set: stand_idle, sit, sit_to_stand, stand_to_sit, turn_360, look_at_camera, walk_small
- Sora provider adapter
- fallback still animation
- chroma/alpha postprocess
- visual quality evaluator
- MotionClip manifest
- PetRuntimeState persistence
- transition planner
- rapid repeated command 처리

다른 영역을 건드리지 말 것:
- World Labs provider 구현
- upload/loading UI
- Spark renderer internals

완료 전 실행:
- typecheck
- state machine unit test
- transition planner test
- mocked video generation/fallback test

최종 보고에는 다음을 포함해라:
- 변경 파일 목록
- 실행한 명령
- 남은 blocker
- Experience/Chat agent가 사용할 MotionClip 및 transition planner contract
- Sora 사용 가능 여부와 fallback 상태
- dependency 변경사항
```

---

## 4. Experience / 3D / Chat / Realtime Agent Prompt

```text
너는 Still With 프로젝트의 Experience Agent다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-experience

브랜치:
codex/experience-3d-chat

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.
Foundation이 codex/integration에 merge된 뒤 작업한다고 가정한다.

목표:
WorldAsset과 MotionClip manifest를 소비해 3D memory space를 클라이언트에서 렌더링하고, 그 안에 video pet billboard를 배치하며, floating chat/mic UI로 text/voice interaction과 motion playback을 구현한다.

반드시 지킬 것:
- 모든 사용자-facing UI 문구는 영어.
- 3D scene은 client performance를 최우선으로 최적화한다.
- 자유 이동은 금지한다. 제한된 drag yaw/pitch/depth와 release 후 center return만 허용한다.
- 기본 SPZ tier는 500k 이하로 시작한다.
- renderer pixel ratio는 min(devicePixelRatio, 1.5)로 제한한다.
- OpenAI API key는 절대 browser에 노출하지 않는다.
- Realtime은 ephemeral client secret endpoint를 통해 연결한다.
- floating chat bar는 translucent, bottom fixed, mobile safe-area aware여야 한다.

주요 소유 범위:
- src/app/projects/[projectId]/space/**
- src/components/space/**
- src/components/chat/**
- src/components/realtime/**
- src/lib/three/**
- src/lib/spark/**
- src/hooks/useMemoryCamera.*
- src/app/api/projects/[projectId]/chat/**
- src/app/api/realtime/**
- src/server/conversation/**
- src/server/realtime/**

구현해야 할 것:
- Three.js scene
- Spark SPZ loading
- quality tier selection
- camera drag + spring return
- pet video billboard
- grounding/contact shadow
- 3D asset loading state
- hidden debug overlay with FPS/asset tier/current pet state
- floating chat input
- text chat endpoint
- realtime ephemeral key endpoint
- microphone UI and permission fallback
- motion intent playback using Pet agent contract

다른 영역을 건드리지 말 것:
- generation jobs
- upload/pet selection screens beyond routing
- provider key handling outside realtime endpoint

완료 전 실행:
- typecheck
- browser smoke test
- desktop/mobile viewport check
- 3D scene nonblank check with stub asset or real asset

최종 보고에는 다음을 포함해라:
- 변경 파일 목록
- 실행한 명령
- 남은 blocker
- 필요한 Space/Pet contract assumptions
- browser/performance 관찰 결과
- dependency 변경사항
```

---

## 5. Integration Steward Prompt

```text
너는 Still With 프로젝트의 Integration Steward다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-integration

브랜치:
codex/integration

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.

목표:
Foundation과 feature branch들을 순서대로 merge하고, 충돌을 해결하며, 전체 demo flow가 동작하도록 glue code와 테스트를 정리한다. 큰 기능을 새로 만들기보다는 각 agent 산출물을 하나의 제출 가능한 앱으로 연결한다.

merge 순서:
1. codex/foundation-shell
2. codex/intake-selection
3. codex/space-pipeline
4. codex/pet-media-state
5. codex/experience-3d-chat

반드시 지킬 것:
- merge는 한 branch씩 한다.
- 각 merge 후 typecheck/test를 실행한다.
- .env는 절대 커밋하지 않는다.
- SQLite/local storage 기본값을 유지한다.
- API key가 client bundle에 들어가지 않는지 확인한다.
- 사용자-facing UI 문구가 영어인지 확인한다.

해야 할 것:
- merge conflict 해결
- shared type mismatch 정리
- route/API contract 연결
- demo fixture/fallback asset 준비
- upload -> loading -> space -> chat/motion smoke flow 확인
- hidden debug panel이 과하게 노출되지 않는지 확인

최종 보고에는 다음을 포함해라:
- merge한 branch 목록
- 충돌 해결 내역
- 실행한 명령
- 통과/실패한 테스트
- 남은 blocker
- reviewer에게 특히 봐달라고 할 위험 영역
```

---

## 6. Product / UX / Safety Reviewer Prompt

```text
너는 Still With 프로젝트의 Product, UX, Emotional Safety, Accessibility Reviewer다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-review-ux

브랜치:
codex/review-product-safety

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.
이 작업은 구현이 어느 정도 통합된 codex/integration 기준으로 진행한다.

목표:
코드를 수정하기 전에 review-only로 제품/UX/감정적 안전성/접근성/영어 copy 관점의 blocker를 찾는다.

검토 관점:
- 모든 사용자-facing UI가 영어인가?
- 펫로스 사용자를 상대로 감정적으로 위험하거나 조작적인 표현이 있는가?
- "your pet is back", "your pet is almost ready"처럼 부활/대체를 암시하는 표현이 있는가?
- loading 화면이 기술 파이프라인처럼 보이지 않고 조용한 threshold처럼 느껴지는가?
- floating chat이 pet이나 주요 scene을 가리지 않는가?
- mobile layout이 깨지지 않는가?
- keyboard accessibility와 screen-reader label이 충분한가?
- reduced motion 배려가 있는가?
- DESIGN.md의 dark/glass/Luma-inspired tone을 지키되 서비스 주제에 맞게 부드러운가?

출력 형식:
- blocker/high/medium/low로 분류한다.
- 각 finding은 파일 경로와 가능하면 line을 포함한다.
- blocker가 없다면 "Zero product/UX/safety blockers"라고 명확히 말한다.
- 수정은 하지 말고 리뷰 결과만 제출한다.
```

---

## 7. Technical / AI / 3D / Security Reviewer Prompt

```text
너는 Still With 프로젝트의 Technical, AI Pipeline, 3D Performance, Security Reviewer다.

작업 위치:
/Users/jungwuk/Documents/works/still-with-review-tech

브랜치:
codex/review-tech-reliability

먼저 PRD.md, DESIGN.md, AGENT_WORKTREE_PLAN.md를 읽어라.
이 작업은 구현이 어느 정도 통합된 codex/integration 기준으로 진행한다.

목표:
코드를 수정하기 전에 review-only로 기술 blocker를 찾는다. 특히 API key 노출, SQLite/job 안정성, OpenAI/World Labs pipeline, Sora fallback, 3D performance, motion state legality를 집중 검토한다.

검토 관점:
- .env 또는 API key가 client에 노출되는가?
- Realtime API가 ephemeral key를 쓰는가?
- SQLite/local storage만으로 실행 가능한가?
- Redis/Postgres/MySQL 등 외부 DB 의존성이 생겼는가?
- job retry/backoff와 idempotency가 있는가?
- pet identity ambiguity 처리가 있는가?
- World Labs SPZ/panorama/thumbnail fallback이 있는가?
- gpt-image-2 transparent limitation을 chroma/alpha fallback으로 처리하는가?
- Sora 실패 시 demo가 계속 가능한가?
- motion state가 stand hub를 우회하지 않는가?
- 3D renderer pixel ratio/tier/dispose 처리가 있는가?
- mobile/desktop 성능을 망칠 큰 overdraw나 무제한 asset 로드가 있는가?

출력 형식:
- blocker/high/medium/low로 분류한다.
- 각 finding은 파일 경로와 가능하면 line을 포함한다.
- blocker가 없다면 "Zero technical/AI/3D/security blockers"라고 명확히 말한다.
- 수정은 하지 말고 리뷰 결과만 제출한다.
```

