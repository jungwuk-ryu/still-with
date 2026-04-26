# Parallel Agent Worktree Plan

This plan splits Still With into local git worktrees so multiple AI agents can work in parallel and merge later with minimal conflicts.

The project is still docs-only, so the highest conflict risk is shared scaffolding: `package.json`, app routing, shared types, DB schema, and provider contracts. Because of that, do not launch all builders at once from the initial repository.

Recommended team shape:

- 5 implementation agents total.
- 1 foundation agent runs first and freezes the project skeleton.
- 4 feature agents run in parallel after foundation lands.
- 1 integration steward merges and fixes glue.
- 2 reviewer agents run after integration and repeat review until zero blockers.

Peak parallel implementation count: 4 feature agents. This is the safest local worktree split for the current repo.

## Non-Negotiable Technical Defaults

- Use SQLite as the default flat-file database.
- Do not require Postgres, MySQL, Redis, or any separately installed DB service.
- Use a SQLite-backed `GenerationJob` table plus an in-process worker loop instead of Redis/BullMQ.
- Use local filesystem storage by default.
- Never commit `.env`; each worktree may symlink the root `.env` for local testing.
- User-facing web UI copy must be English.
- Follow `PRD.md` and `DESIGN.md`.

## Branches and Worktrees

Base/integration branch:

- Branch: `codex/integration`
- Worktree: `../still-with-integration`

Implementation branches:

- Foundation: `codex/foundation-shell` at `../still-with-foundation`
- Intake: `codex/intake-selection` at `../still-with-intake`
- Space: `codex/space-pipeline` at `../still-with-space`
- Pet media/state: `codex/pet-media-state` at `../still-with-pet`
- Experience: `codex/experience-3d-chat` at `../still-with-experience`

Review worktrees, created later only during review:

- Product/UX/safety review: `codex/review-product-safety` at `../still-with-review-ux`
- Technical/AI/3D/security review: `codex/review-tech-reliability` at `../still-with-review-tech`

## Setup Flow

First, commit the shared planning files on the main repo or a planning branch. Do not commit `.env`.

Suggested files to commit before creating worktrees:

- `.gitignore`
- `DESIGN.md`
- `PRD.md`
- `AGENT_WORKTREE_PLAN.md`
- `scripts/create-agent-worktrees.sh`

Create the integration branch/worktree and the foundation worktree:

```bash
git branch codex/integration
git worktree add ../still-with-integration codex/integration
git worktree add ../still-with-foundation -b codex/foundation-shell codex/integration
ln -s "$(pwd)/.env" ../still-with-foundation/.env
ln -s "$(pwd)/.env" ../still-with-integration/.env
```

After the foundation branch is complete, merge it into the integration branch:

```bash
git -C ../still-with-integration switch codex/integration
git -C ../still-with-integration merge --no-ff codex/foundation-shell
```

Then create the four parallel feature worktrees:

```bash
./scripts/create-agent-worktrees.sh codex/integration
```

## Agent 0: Foundation Shell

Branch: `codex/foundation-shell`

Owns:

- Next.js TypeScript scaffold.
- Root package and config files.
- Design tokens from `DESIGN.md`.
- Route shell.
- Shared types.
- SQLite setup.
- Local filesystem storage abstraction.
- SQLite-backed job table and in-process worker abstraction.
- Provider adapter interfaces.
- Minimal test setup.

Primary paths:

- `package.json`
- `next.config.*`
- `tsconfig.json`
- `src/app/**`
- `src/styles/**`
- `src/types/**`
- `src/lib/env/**`
- `src/server/db/**`
- `src/server/storage/**`
- `src/server/jobs/**`
- `src/server/providers/**`

Must deliver:

- App runs locally without installing a DB service.
- SQLite defaults to `./data/still-with.sqlite`.
- Local uploads default to `./data/uploads`.
- `OPENAI_API_KEY` and `WORLDLABS_API_KEY` are validated when provider calls are used.
- `CLAUDE_API_KEY` may remain unused unless a later agent explicitly needs it.
- Shared contracts exist for `Project`, `UploadedImage`, `PetProfile`, `SceneCluster`, `WorldAsset`, `MotionClip`, `PetRuntimeState`, `GenerationJob`, and `ProjectStatus`.
- Route stubs exist for upload, loading, clarification, and the 3D experience.

Must not do:

- Implement full OpenAI/World Labs business logic.
- Build all feature screens.
- Commit `.env`.

## Agent 1: Intake, Pet Selection, and Loading

Branch: `codex/intake-selection`

Owns:

- Upload screen.
- Image preview and validation.
- `POST /api/projects`.
- Pet selection orchestration endpoint.
- Clarification flow.
- Loading/progress UI as a quiet emotional threshold, not a technical pipeline dashboard.
- Project status lifecycle.
- User-friendly retry/backoff display.

Primary paths:

- `src/app/page.*`
- `src/app/projects/[projectId]/loading/**`
- `src/app/projects/[projectId]/clarify/**`
- `src/app/api/projects/**`
- `src/components/upload/**`
- `src/components/loading/**`
- `src/components/clarification/**`
- `src/server/projects/**`

Depends on:

- Foundation shared types, SQLite DB helper, local storage helper, job table.

Output contract:

- Confirmed `PetProfile` or `clarificationRequired`.
- Project status events that Space, Pet, and Experience agents can consume.
- Loading stage mapping from internal jobs to seven user-facing emotional stages.

Acceptance checklist:

- [ ] Loading title is "A quiet place is being prepared".
- [ ] Loading subtitle is "We're taking a little time to make this feel gentle, familiar, and safe."
- [ ] Primary loading UI uses "Step N of 7", not a percent counter.
- [ ] User-facing stages match PRD Section 6.3.
- [ ] Primary UI does not show model names, API names, raw job IDs, or phrases like "Generating your pet".
- [ ] Retry/backoff copy is gentle and non-technical.
- [ ] Internal job detail is available only in logs or hidden debug UI.

Must not touch:

- World Labs provider implementation.
- Pet video/chroma implementation.
- Three.js/Spark renderer.

## Agent 2: Space Pipeline

Branch: `codex/space-pipeline`

Owns:

- Scene classification job.
- Space seed prompt planning.
- `gpt-image-2` scene seed generation calls, if needed.
- World Labs adapter.
- World Labs operation polling.
- World asset persistence.
- Panorama/thumbnail fallback path.

Primary paths:

- `src/ai/scene/**`
- `src/world/**`
- `src/server/providers/worldlabs/**`
- `src/server/jobs/scene-classification/**`
- `src/server/jobs/space-seeds/**`
- `src/server/jobs/worldlabs/**`
- `src/server/assets/world-assets/**`

Depends on:

- Foundation provider interfaces.
- Intake `PetProfile` and `SceneCluster` contracts.

Output contract:

- `WorldAsset` manifest with SPZ URLs, collider mesh URL, panorama URL, thumbnail URL, ground offset, and initial camera hints.

Must not touch:

- Upload/clarification UI.
- Pet motion state machine.
- 3D renderer internals.

## Agent 3: Pet Media and State

Branch: `codex/pet-media-state`

Owns:

- Pet identity prompt implementation if not completed by Intake.
- Pet trait extraction.
- Pet keyframe generation with `gpt-image-2`.
- Sora-first video generation adapter.
- Static/fallback animation if Sora is unavailable.
- Chroma/alpha post-processing.
- Visual quality evaluator.
- Motion clip manifest.
- Runtime pet state graph.
- Transition planner.

Primary paths:

- `src/ai/pet/**`
- `src/pet/**`
- `src/server/providers/openai/**`
- `src/server/providers/sora/**`
- `src/server/jobs/pet-analysis/**`
- `src/server/jobs/pet-keyframes/**`
- `src/server/jobs/pet-video/**`
- `src/server/jobs/video-postprocess/**`
- `src/server/jobs/quality-evaluation/**`
- `src/server/motion/**`

Depends on:

- Foundation DB/job contracts.
- Intake project and upload contracts.

Output contract:

- `MotionClip` manifest.
- `PetRuntimeState`.
- Transition planner API where `stand` is the hub state.

Must not touch:

- World Labs provider implementation.
- Upload/loading UI.
- Spark renderer internals.

## Agent 4: 3D Experience, Chat, and Realtime

Branch: `codex/experience-3d-chat`

Owns:

- 3D memory space page.
- Three.js + Spark SPZ loading.
- Client-side performance tiers.
- Limited camera drag and spring return.
- Pet video billboard placement.
- Floating chat bar.
- Text chat endpoint integration.
- Realtime ephemeral key endpoint and microphone UI.
- Motion intent playback using Agent 3's transition planner contract.

Primary paths:

- `src/app/projects/[projectId]/space/**`
- `src/components/space/**`
- `src/components/chat/**`
- `src/components/realtime/**`
- `src/lib/three/**`
- `src/lib/spark/**`
- `src/hooks/useMemoryCamera.*`
- `src/app/api/projects/[projectId]/chat/**`
- `src/app/api/realtime/**`
- `src/server/conversation/**`
- `src/server/realtime/**`

Depends on:

- Foundation route shell.
- Space `WorldAsset` manifest.
- Pet `MotionClip` and `PetRuntimeState` manifests.

Output contract:

- Working user experience that can load real or stubbed world/pet assets.
- Text or voice input can trigger at least one motion sequence.

Must not touch:

- Generation jobs except through stable APIs.
- Upload/pet selection screens beyond routing.
- `.env`.

## Integration Steward

Branch: `codex/integration`

Worktree: `../still-with-integration`

Merge order:

1. `codex/foundation-shell`
2. `codex/intake-selection`
3. `codex/space-pipeline`
4. `codex/pet-media-state`
5. `codex/experience-3d-chat`

Responsibilities:

- Merge one branch at a time.
- Resolve conflicts immediately.
- Run typecheck/tests after each merge.
- Keep `.env` ignored.
- Fix integration glue only.
- Avoid adding large new features.
- Prepare known-good demo fixture assets.

Required checks:

- App starts locally.
- SQLite DB initializes automatically.
- Upload path works.
- Status loading path works.
- Space page can render a stub or real SPZ asset.
- Chat can trigger a motion command.
- No API key is exposed to the browser.

## Review Agents

Reviewer R1: Product, UX, emotional safety, accessibility, and English copy.

Reviewer R2: Technical architecture, OpenAI/World Labs pipeline, 3D performance, security, and reliability.

Review loop:

1. Freeze `codex/integration` at a checkpoint commit.
2. R1 and R2 review independently.
3. Findings are labeled `blocker`, `high`, `medium`, or `low`.
4. Every blocker is assigned to the original scope owner or integration steward.
5. Fix blockers.
6. Rerun relevant tests and browser checks.
7. Rerun both reviewers.
8. Repeat until both reviewers report zero blockers.

## Conflict Control Rules

- No one commits `.env`.
- No one commits generated user photos or provider outputs unless they are explicitly demo fixture assets.
- Only Foundation edits root config before feature work starts.
- Feature agents must avoid broad edits to shared files.
- Any dependency addition must be listed in the final report.
- Any shared type change must be minimal and documented.
- If an agent needs another agent's owned path, it should document the required change instead of editing broadly.

## Per-Agent Prompt Template

```text
You are working on Still With in this git worktree: <WORKTREE_PATH>.

Read PRD.md, DESIGN.md, and AGENT_WORKTREE_PLAN.md first.

Your branch is <BRANCH_NAME>.
Your ownership area is <OWNERSHIP_FROM_PLAN>.

You are not alone in the codebase. Other agents are working in parallel on different branches. Do not revert or rewrite work outside your ownership area. If you need a cross-area change, document it clearly in your final report.

Use SQLite as the default flat-file database. Do not introduce Postgres, Redis, MySQL, or any separately installed DB service. Do not commit .env or expose secret values. You may use the local .env for testing.

Implement your assigned scope end to end, add focused tests, run relevant checks, and finish with:
- Files changed
- Commands run
- Remaining blockers
- Cross-agent integration notes
- Dependency changes
```
