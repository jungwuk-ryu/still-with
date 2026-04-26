# Still With Agent Guide

Still With is a Next.js/TypeScript memorial experience for companion-animal loss. Keep user-facing web copy in English, follow `PRD.md` and `DESIGN.md`, and preserve the gentle, emotionally safe tone: never imply resurrection, sentience, or factual afterlife claims.

## Project Map

- `src/app`: Next.js routes, API endpoints, and page shells.
- `src/components`: upload, loading, clarification, chat, realtime, and 3D space UI.
- `src/server/db`: SQLite schema, connection, and project persistence.
- `src/server/jobs`: in-process generation job handlers and tests.
- `src/server/providers`: OpenAI, World Labs, Sora, Veo, and ElevenLabs provider adapters. Keep secrets server-side only.
- `src/server/storage`: local filesystem storage, signed storage URLs, and provider image URL helpers.
- `src/server/motion`, `src/pet`, `src/world`, `src/ai`: pet motion, world manifests, and AI prompt/domain logic.
- `src/styles`: global styles and design tokens.

## Commands

- Install: `npm ci`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Production build: `npm run build`

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before handing off integration work unless a dependency or environment issue blocks one of them.

## Non-Negotiable Rules

- Conventional Atomic is mandatory: keep changes atomic and use Conventional Commit-style commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) for local commits and merge summaries.
- Never commit `.env`, `.env.*`, provider secrets, real user uploads, generated private media, SQLite files, or local storage signing secrets.
- Do not introduce Postgres, Redis, MySQL, or another required service for the MVP. SQLite and local filesystem storage are the default local runtime.
- Do not expose API keys or provider operation details in browser bundles or primary UI.
- Do not broaden feature scope during integration. Fix glue, contracts, tests, and demo-safe fallbacks.
- User-facing web UI copy must remain English.

## Required Direct Verification For Code Changes

For any code-changing integration task, do not use reviewer subagents before final handoff. The integration owner must personally review and verify the current result from both perspectives:

1. Product correctness, UX, emotional safety, accessibility, and English copy.
2. Technical architecture, shared contracts, provider/storage/db/job flow, security, reliability, and tests.

Document any `blocker` findings, fix every blocker, rerun the relevant validation, and repeat the direct review and test loop until zero blockers remain. Do not hand off code-changing integration work without listing the commands or manual checks performed and any remaining non-blocking risks.

## Integration Workflow

- Use `/home/ubuntu/works/still-with-integration` for the integration worktree in this environment.
- Merge feature branches into `codex/integration` one at a time with `GIT_MERGE_AUTOEDIT=no git merge --no-ff <branch>`.
- Resolve conflicts immediately and preserve both sides of shared barrel exports, type contracts, and provider/storage helpers when both are valid.
- After dependency changes, run `npm ci` before interpreting lint/typecheck/test output.
- Pay special attention to cross-branch contracts: `MotionClip`, `PetProfile`, `WorldAsset`, storage signed URLs, and project status/loading stages.

## Local Data And Secrets

- `.env.example` documents the expected local variables. Put real values only in ignored `.env` files.
- Default SQLite path is `./data/still-with.sqlite`.
- Default local storage path is `./data/uploads`.
- Signed local storage URLs may create `.storage-url-secret`; it is local secret material and must stay ignored.
