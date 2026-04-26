# Still With

Still With is a Next.js and TypeScript memorial experience for companion-animal loss. It turns a small set of uploaded photos into a private 3D memory space with generated room assets, gentle pet motion, ambient music, pet sound effects, sharing, chat, and public dream browsing.

The product tone should stay quiet and emotionally safe. UI copy must not imply resurrection, sentience, or factual afterlife claims.

## Current Experience

- Upload one to twelve JPG, PNG, WEBP, HEIC, or HEIF photos and provide the pet's name.
- Create a local SQLite project record and persist uploads to local filesystem storage.
- Run in-process generation jobs for pet analysis, scene classification, space previews, World Labs scenes, pet motion/video, ElevenLabs audio, dream fragments, and completion email.
- Enter a 3D memory space with background audio, contextual pet sound effects, floating chat, a share dialog, and dream-fragment space switching.
- Browse ready public dreams from `/projects`.
- View the Korean product pitch deck at `/pitch`.

Upload validation is limited to required fields, file type, count, and file size. Uploads are not blocked by an external pet-presence image check.

## Stack

- Next.js App Router
- React and TypeScript
- SQLite via `better-sqlite3`
- Local filesystem storage by default
- Three.js for 3D space rendering
- Provider adapters for OpenAI, Gemini, World Labs, Veo, ElevenLabs, and Resend
- Vitest, ESLint, and TypeScript for validation

## Local Setup

Install dependencies:

```bash
npm ci
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill only the provider keys you need for the workflows you are testing. Never commit real keys, uploaded user photos, generated private media, SQLite files, or storage signing secrets.

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment

The default local runtime uses:

- `SQLITE_PATH=./data/still-with.sqlite`
- `LOCAL_STORAGE_DIR=./data/uploads`
- `STORAGE_URL_SECRET=replace-with-a-stable-local-secret`

Provider keys are loaded server-side only:

- `OPENAI_API_KEY`
- `WORLDLABS_API_KEY`
- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Useful optional settings:

- `NEXT_PUBLIC_APP_URL` sets the public app origin used by generated links.
- `VEO_VIDEO_RESOLUTION` controls pet video fidelity.
- `AUDIO_PROMPT_MODEL` chooses the model used to plan audio prompts.

## Validation

Run these before handing off integration work:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Project Map

- `src/app`: routes, API handlers, and page shells.
- `src/components`: upload flow, loading, clarification, chat, realtime, and 3D space UI.
- `src/server/db`: SQLite schema, connection, and persistence.
- `src/server/projects`: project lifecycle, upload intake, status, public dreams, dream fragments, and email helpers.
- `src/server/jobs`: in-process generation job handlers and worker runtime.
- `src/server/providers`: provider adapters. Keep secrets server-side.
- `src/server/storage`: local storage, signed URLs, and provider image URL helpers.
- `src/server/audio`: audio prompt planning, audio asset keys, and audio persistence.
- `src/server/motion`, `src/pet`, `src/world`, `src/ai`: motion, pet/world manifests, and AI prompt/domain logic.
- `src/styles`: global styles and design tokens.

## Integration Notes

- Use conventional, atomic commit messages.
- Keep SQLite and local filesystem storage as the MVP default.
- Avoid adding external infrastructure unless the product requirement explicitly changes.
- Preserve privacy-first defaults and gentle wording throughout the experience.
