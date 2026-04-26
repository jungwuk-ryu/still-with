# Still With PRD

## 1. Product Summary

Still With is a web experience for people grieving the loss of a companion animal. The user uploads photos of their pet, waits while the system reconstructs a meaningful memory space, and then enters a gentle 3D scene where a video-based version of the pet can respond to natural-language voice or text.

The product must feel emotionally complete enough for a hackathon submission and winner-level demo. Long-term maintainability is not a primary constraint, but the submitted experience must be polished, technically convincing, visually coherent, and robust enough to survive live judging.

All user-facing web UI copy must be written in English.

## 2. Goals

- Let a user upload multiple pet photos and automatically identify the most likely target pet.
- Ask for clarification only when the uploaded photos consistently contain multiple pets and the target pet cannot be selected confidently.
- Extract stable visual traits of the selected pet and reuse them across image, video, and interaction generation.
- Classify uploaded photos by place and create a 3D memory space using World Labs.
- Generate pet-only motion clips that can be placed inside the 3D space as a video asset.
- Let the user speak to the pet by text or microphone from a translucent floating input at the bottom of the screen.
- Preserve pet state so motion transitions feel continuous instead of jumping between disconnected clips.
- Show calm, emotionally appropriate loading progress while long-running AI jobs are happening, including user-friendly retry and backoff states.
- Optimize the 3D client experience so the demo runs smoothly on typical modern laptops and acceptably on mobile.
- Follow `DESIGN.md`, adapted into a brighter, dreamlike memorial tone appropriate for pet-loss users.

## 3. Non-Goals

- No account system for the hackathon MVP unless needed for persistence.
- No payment, subscription, team workspace, or admin console.
- No fully free-roaming first-person navigation.
- No production-grade content moderation console.
- No general-purpose pet simulator with arbitrary animations.
- No claim that the generated pet is alive, sentient, or a replacement for the real pet.
- No long-term scalable multi-tenant architecture beyond what the demo needs.

## 4. Audience and Emotional Tone

Primary audience: people experiencing pet loss who want a gentle, beautiful, private way to revisit memories.

The experience should feel:

- Tender, calm, and reverent.
- Dreamlike and bright, with a soft heavenly quality.
- Polished enough to feel magical, not experimental.
- Emotionally safe and never manipulative.
- More like entering a memory than using a productivity tool.

The assistant voice must avoid pretending to be the deceased pet in a literal or exploitative way. It should speak as a gentle memory companion and use phrasing such as:

- "I'm here with you in this memory."
- "That sounds like something you loved about them."
- "Let's stay here for a little while."

Avoid:

- "I came back."
- "I am your pet."
- "I missed you from heaven."
- Any wording that implies factual afterlife claims or sentient resurrection.

## 5. Design Requirements

Follow `DESIGN.md` as the design foundation:

- Dark-mode-native base using `#131517`, `#212325`, and `#333537`.
- Inter/system typography with weights 400, 500, and 600 only.
- Faint borders using low-opacity white.
- Glassy floating surfaces with `backdrop-filter: blur(16px)`.
- 8px radius for controls, 12px radius for cards, 24px radius for larger modal-like panels.
- Rainbow gradient moments used sparingly.
- Real user images and generated scene media should carry most of the visual emotion.

Adaptation for Still With:

- The base can remain near-black, but the 3D memory scene should feel bright, airy, and heavenly through lighting, bloom, fog, pale highlights, soft lens warmth, and gentle color accents.
- Avoid heavy cemetery, religious, horror, or mourning imagery.
- Use luminous whites, soft cranberry, pale violet, sky blue, and warm gold as restrained accents.
- Avoid a one-note purple/blue gradient interface.
- The first viewport must immediately communicate the product: upload photos, create a memory space, meet the pet inside it.
- Do not make a marketing-only landing page. The first usable screen must be the upload experience.

Required primary screens:

- Upload screen.
- Clarification screen when pet selection is ambiguous.
- Loading/progress screen.
- 3D memory space screen.
- Failure/retry screen.

## 6. User Journey

### 6.1 Upload

The user lands on the upload screen and selects multiple pet photos.

Requirements:

- Accept common image formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` if feasible.
- Require at least 3 images for the best experience, but allow 1 image with a warning that quality may be lower.
- Show thumbnails before upload.
- Let the user remove accidental images before starting.
- Use English UI copy only.
- Display privacy reassurance in one short line, not a long legal block.

Suggested copy:

- Page title: "Create a place to remember them."
- Subtitle: "Upload a few photos of your pet and the places they loved."
- CTA: "Begin"
- Helper text: "More photos help us recognize your pet and rebuild the space more faithfully."

### 6.2 Pet Identification

After upload, `gpt-5.4` analyzes all images.

The system must:

- Detect every visible pet candidate in every image.
- Cluster pet candidates by visual identity.
- Count how often each candidate appears across images.
- Choose the most frequently appearing pet if confidence is high.
- Extract stable traits: species, breed-like description, coat color, markings, face shape, ear shape, tail, size, collar/accessories, distinctive features.
- Store the selected `PetProfile`.

Ambiguity rule:

- If one pet appears clearly more often than the others, select that pet.
- If all or most photos include multiple pets and no dominant pet can be selected confidently, show a clarification prompt.
- The clarification prompt should ask for visual details, not emotional backstory.

Suggested copy:

- "Which one should we bring into the memory?"
- "Tell us a visual detail, like 'the small white dog with brown ears' or 'the cat with the blue collar.'"

### 6.3 Loading

The loading page is a quiet emotional threshold, not a technical pipeline dashboard.

Primary loading concept:

- Title: "A quiet place is being prepared"
- Subtitle: "We're taking a little time to make this feel gentle, familiar, and safe."
- Current stage example: "Remembering the light"

The user-facing page must show meaningful progress without exposing raw AI pipeline details.

The user should see:

- A calm current stage.
- A simple step indicator such as "Step 3 of 7".
- Retry/backoff information only in gentle, non-technical language.
- A calm animated visual using the product theme.
- No percent counter in the primary UI.
- No model names, API names, asset-generation jargon, or raw job IDs in the primary UI.

Internal branch status still exists, but it belongs in logs or the hidden debug panel, not in the normal user experience.

Suggested loading stages:

- "Looking through your memories"
- "Finding what feels familiar"
- "Remembering the light"
- "Making the space feel calm"
- "Preparing a gentle presence"
- "Checking the feeling"
- "Ready when you are"

Suggested subcopy:

- "Finding the moments, colors, and places that appear in your photos."
- "Noticing the little details that made them feel like them."
- "Shaping the room with the warmth and light from your photos."
- "Giving the memory space a quiet sense of depth."
- "Creating soft movement that belongs naturally in the space."
- "Making sure the result feels close, respectful, and gentle."
- "Your memory space is ready to enter."

Avoid these loading phrases:

- "Generating your pet"
- "Creating AI companion"
- "Rebuilding your pet"
- "Your pet is almost ready"
- "Motion model is processing"
- "3D world generation in progress"

### 6.4 Experience

The user enters a 3D memory space.

The scene must include:

- A World Labs-generated 3D space rendered client-side.
- A video-based pet placed inside the scene.
- A bottom floating chat input.
- A microphone button.
- A text submit button.
- Subtle status feedback when the pet is listening, thinking, or moving.

The user can:

- Drag the scene horizontally.
- Move slightly forward/back through limited camera depth.
- Release the mouse/touch and watch the camera gently return to center.
- Speak or type natural-language messages.
- Trigger pet motion through natural language, such as "turn around", "sit", "come closer", or "look at me."

The user cannot:

- Freely walk around the scene.
- Teleport through the space.
- Control the pet with visible game-like buttons in the primary experience.

## 7. Technical Architecture

Recommended hackathon stack:

- Frontend: Next.js, TypeScript, React, Tailwind or CSS modules.
- 3D: Three.js + Spark for SPZ Gaussian splat rendering.
- Backend: Next.js API routes or a small Node/Fastify server.
- Queue: SQLite-backed jobs table plus an in-process worker loop. Do not require Redis for the MVP.
- Database: local SQLite flat-file database. Do not require Postgres, MySQL, Redis, or any separately installed DB service.
- Object storage: local filesystem storage for demo mode. S3-compatible storage may be added later, but must not be required for local execution.
- AI providers: OpenAI and World Labs.
- Optional video fallback provider: Seedance 2.0 adapter, only if API access is available.

The architecture should prioritize completing the demo with minimal local setup. Use a monorepo Next.js app with API routes, a local SQLite database, local file storage, and provider adapters clean enough to swap later.

## 8. Environment Variables

Current `.env` coverage, checked without exposing secret values:

- `OPENAI_API_KEY`: present.
- `WORLDLABS_API_KEY`: present.
- `CLAUDE_API_KEY`: present.

Required for the planned MVP:

- `OPENAI_API_KEY`
- `WORLDLABS_API_KEY`

Likely needed for the web app/server:

- `SQLITE_PATH`, optional. Default to `./data/still-with.sqlite`.
- `LOCAL_STORAGE_DIR`, optional. Default to `./data/uploads`.
- `NEXT_PUBLIC_APP_URL`

Optional or fallback keys:

- `SEEDANCE_API_KEY` or provider-specific equivalent, only if Seedance 2.0 fallback is implemented.
- `ANTHROPIC_API_KEY` if `CLAUDE_API_KEY` must be renamed for SDK compatibility.

OpenAI should cover:

- `gpt-5.4` reasoning, classification, prompt planning, judging, and conversation.
- `gpt-image-2` pet and scene seed image generation.
- Sora video generation if the account has access through the configured OpenAI API key.
- Realtime API if the account has access through the configured OpenAI API key.

Important model note:

- Treat the requested `gpt-image-5.4` concept as `gpt-5.4` planning prompts for `gpt-image-2`.
- Do not block the MVP on a non-confirmed image model name.

## 9. Core Data Model

### Project

Fields:

- `id`
- `createdAt`
- `updatedAt`
- `status`
- `currentStage`
- `currentStepIndex`
- `totalSteps`
- `debugProgressPercent`
- `selectedPetId`
- `errorCode`
- `errorMessage`
- `retryCount`
- `completedAt`

### UploadedImage

Fields:

- `id`
- `projectId`
- `originalUrl`
- `thumbnailUrl`
- `width`
- `height`
- `mimeType`
- `exifMetadata`
- `uploadOrder`

### PetCandidate

Fields:

- `id`
- `projectId`
- `imageId`
- `boundingBox`
- `species`
- `description`
- `visualEmbeddingRef`
- `confidence`

### PetProfile

Fields:

- `id`
- `projectId`
- `sourceCandidateIds`
- `species`
- `name`
- `traitSummary`
- `distinctiveMarkings`
- `faceDescription`
- `bodyDescription`
- `accessories`
- `selectionConfidence`
- `clarificationRequired`
- `clarificationAnswer`

### SceneCluster

Fields:

- `id`
- `projectId`
- `label`
- `sourceImageIds`
- `representativeImageIds`
- `spatialPrompt`
- `seedImageUrls`
- `worldLabsOperationId`
- `worldId`
- `status`

### WorldAsset

Fields:

- `id`
- `projectId`
- `sceneClusterId`
- `worldId`
- `spzUrl100k`
- `spzUrl500k`
- `spzUrlFullRes`
- `colliderMeshUrl`
- `panoUrl`
- `thumbnailUrl`
- `groundPlaneOffset`
- `initialCameraPose`

### MotionClip

Fields:

- `id`
- `projectId`
- `petProfileId`
- `motionKey`
- `fromState`
- `toState`
- `prompt`
- `keyframeImageUrls`
- `rawVideoUrl`
- `processedVideoUrl`
- `alphaVideoUrl`
- `durationMs`
- `loopable`
- `qualityScore`
- `status`

### PetRuntimeState

Fields:

- `projectId`
- `currentPose`
- `targetPose`
- `currentClipId`
- `queuedMotionKeys`
- `lastUserIntent`
- `lastUpdatedAt`

## 10. Backend API Requirements

### `POST /api/projects`

Creates a project and uploads images.

Responsibilities:

- Validate image count and type.
- Store originals and thumbnails.
- Create `Project`.
- Enqueue analysis jobs.
- Return `projectId`.

### `GET /api/projects/:projectId/status`

Streams status by SSE or returns JSON polling state.

Responsibilities:

- Return current stage.
- Return branch-level job status.
- Return retry/backoff messages.
- Return available preview assets.
- Return final readiness state.

### `POST /api/projects/:projectId/clarify-pet`

Stores the user's clarification answer.

Responsibilities:

- Save clarification answer.
- Re-run pet selection.
- Resume generation jobs.

### `POST /api/projects/:projectId/chat`

Handles text messages.

Responsibilities:

- Send conversation context and pet state to `gpt-5.4`.
- Return assistant response.
- Return `motionIntent`.
- Enqueue or play matching motion sequence.

### `POST /api/realtime/client-secret`

Creates a short-lived Realtime API session for microphone interaction.

Responsibilities:

- Never expose the real OpenAI API key to the browser.
- Return an ephemeral client secret.
- Configure model, voice, turn detection, and safety instructions.

### `GET /api/projects/:projectId/assets`

Returns renderable assets.

Responsibilities:

- Return selected World Labs SPZ URL by quality tier.
- Return collider mesh if available.
- Return pet video clip manifest.
- Return initial camera and pet placement data.

## 11. AI Pipeline

### 11.1 Pipeline Overview

After upload, the system runs two main branches in parallel after pet identity is confirmed:

- Space branch: classify places, generate seed images, call World Labs, fetch world assets.
- Pet branch: generate pet keyframes, generate motion videos, post-process video for chroma/alpha, build state graph.

Both branches must update the loading screen.

### 11.2 Pet Selection With `gpt-5.4`

Prompt requirements:

- Ask for structured JSON only.
- Identify every visible pet.
- Group candidates likely to be the same pet.
- Select the dominant pet when possible.
- Return `clarificationRequired: true` when ambiguous.
- Return human-readable clarification prompt if needed.

Output schema:

- `petCandidates`
- `identityClusters`
- `selectedClusterId`
- `selectionConfidence`
- `clarificationRequired`
- `clarificationPrompt`
- `petTraitSummary`

Quality checks:

- Reject output if JSON is invalid.
- Retry once with a stricter schema prompt.
- If still invalid, fall back to manual clarification.

### 11.3 Scene Classification

`gpt-5.4` classifies images by space.

Example labels:

- Living room.
- Bedroom.
- Apartment playground.
- Hallway.
- Favorite corner.

Rules:

- Prefer emotionally meaningful spaces with enough visual evidence.
- Select one primary scene for MVP if multiple scenes are available.
- Remove the pet from scene generation prompts so the pet can be composited separately.
- Preserve real spatial cues from source photos: floor type, wall color, windows, furniture, lighting, layout.

### 11.4 Space Seed Generation With `gpt-image-2`

Do not generate top/bottom images by default.

Preferred strategies:

- Best case: use real user photos directly as multi-image World Labs inputs if they depict the same place from useful angles.
- If real photos are insufficient, generate `front`, `left`, `right`, and `back` seed images with `gpt-image-2`.
- If multi-view consistency is too unstable, generate one 2:1 equirectangular panorama seed image and pass it to World Labs as a panorama.

Prompt rules:

- The pet must be absent.
- No people.
- No other animals.
- No clutter that blocks the floor.
- Keep consistent lighting across views.
- Keep a clear floor area where the pet video can stand.
- Preserve source-photo visual details.
- Add subtle dreamlike brightness, not fantasy overload.

### 11.5 World Labs Generation

Use World Labs Marble API.

Expected flow:

- Submit world generation request.
- Store operation ID.
- Poll operation until complete.
- Fetch world object.
- Store returned asset URLs.

Expected returned assets:

- SPZ Gaussian splat URLs at multiple quality tiers.
- Collider mesh URL.
- Panorama URL.
- Thumbnail URL.

World Labs input strategy:

- Multi-image input should use horizontal azimuths such as front, left, right, and back.
- Do not treat "up" and "down" as normal multi-image inputs.
- Use panorama input when a stable 360 scene is more important than preserving every photo angle.

### 11.6 Pet Keyframe Generation With `gpt-image-2`

Generate pet-only keyframes.

Required pose set:

- `stand_idle`
- `sit`
- `sit_to_stand`
- `stand_to_sit`
- `turn_360`
- `look_at_camera`
- `walk_small`

Nice-to-have pose set:

- `lie_down`
- `stand_to_lie`
- `lie_to_stand`
- `tail_wag`
- `head_tilt`

Image requirements:

- Single pet only.
- Full body visible.
- Exact coat markings and facial features.
- Chroma green or blue background.
- No people.
- No objects.
- No other pets.
- Stable camera.
- Stable lighting.
- Pet centered.

Generate at least two keyframes per motion when video generation benefits from start/end references.

### 11.7 Video Generation With Sora First

Use Sora as the primary video generation provider.

Requirements:

- Generate short clips, usually 2-5 seconds.
- Keep each clip focused on one motion.
- Prefer loopable idle clips.
- Avoid camera motion.
- Keep pet size and framing stable.
- Keep chroma background consistent.
- Reject clips that introduce other animals, people, props, or complex backgrounds.

Fallback:

- If Sora is unavailable, blocked, too slow, or not enabled for the API key, use static keyframe crossfade for demo mode.
- Seedance 2.0 can be added as a provider adapter only if a valid API key is available.

### 11.8 Chroma/Alpha Post-Processing

Because transparent backgrounds are not guaranteed from `gpt-image-2`, use a chroma-key pipeline.

Options:

- Server-side FFmpeg chroma key to alpha WebM.
- Client-side shader chroma key on a video texture.
- Segmentation-assisted alpha matte if time allows.

Acceptance criteria:

- Pet edges must not have obvious green halos in the demo view.
- The video plane must not show rectangular background edges.
- Pet must appear grounded in the scene.

### 11.9 Visual Quality Evaluation

Use `gpt-5.4` as an evaluator after each major generation step.

Evaluate:

- Does the generated pet match the uploaded pet?
- Is there exactly one pet?
- Are there no humans or other animals?
- Is the chroma background clean?
- Is the scene similar to uploaded spaces?
- Is the 3D space bright and emotionally appropriate?
- Is the pet placement plausible?

Regeneration policy:

- Try up to 2 prompt revisions per failed generation artifact.
- After 2 failed attempts, fall back to the best available asset and show a recoverable warning internally.
- Do not expose technical failure details to the user unless the flow cannot continue.

## 12. Motion State System

The pet must never jump directly between incompatible states.

State graph:

- `stand` is the hub state.
- `sit` transitions through `stand`.
- `lie` transitions through `stand`.
- `turn` starts and ends at `stand`.
- `walk_small` starts and ends at `stand`.
- `look_at_camera` can play from `stand` or after `sit_to_stand`.

Example:

- Current state: `sit`.
- User says: "Turn around."
- Required sequence: `sit_to_stand` -> `turn_360` -> `stand_idle`.

Runtime requirements:

- Store current state on the server.
- Mirror current state on the client for instant playback.
- Queue motion intents if the user speaks during an active clip.
- Do not interrupt a transition clip halfway unless there is an emergency stop.
- Crossfade audio/visual edges where possible.

## 13. 3D Space Implementation

### 13.1 Rendering Strategy

Use Three.js with Spark.

Responsibilities:

- Load World Labs SPZ into Spark `SplatMesh`.
- Load the collider mesh if available.
- Add pet video plane to the same Three.js scene.
- Add subtle atmospheric post-processing only if performance remains stable.

Initial quality tier:

- Mobile: 100k or 500k SPZ depending on device.
- Desktop default: 500k SPZ.
- High-end desktop: full-res or LoD/RAD asset when available.

### 13.2 Pet Placement

The pet should be placed as a camera-facing or semi-camera-facing video billboard.

Requirements:

- Position near the center of the reconstructed scene.
- Align feet/paws with the floor using `groundPlaneOffset` and collider mesh if available.
- Scale pet based on species and estimated body size.
- Apply soft contact shadow or blob shadow.
- Match scene lighting with a subtle color correction filter.
- Avoid placing the pet behind splat geometry where clipping looks broken.

### 13.3 Camera Control

The scene is not free-roam.

Camera behavior:

- Fixed anchor position.
- Horizontal drag controls yaw within a small range.
- Vertical drag controls pitch within a very small range.
- Wheel or drag depth allows only slight forward/back movement.
- On pointer release, camera eases back to center.
- Use spring-damper smoothing.

Acceptance criteria:

- The user feels they can gently look around.
- The camera cannot break the illusion by moving through geometry.
- On mobile, touch drag feels smooth and predictable.

### 13.4 Performance Requirements

Client optimizations:

- Cap renderer pixel ratio to `min(devicePixelRatio, 1.5)`.
- Use `antialias: false`.
- Lazy-load 3D code after upload/loading flow.
- Load low-quality SPZ first, then upgrade only if stable.
- Pause hidden videos when tab is hidden.
- Use compressed video formats suitable for browser playback.
- Avoid heavy real-time shadows.
- Avoid large transparent overdraw around the pet plane.
- Use requestAnimationFrame only while scene is active.
- Dispose Three.js textures, geometries, and videos on unmount.

Performance targets:

- Desktop: stable 45-60 FPS after assets are loaded.
- Mobile: stable 24-30 FPS acceptable for demo.
- First visible 3D scene: under 5 seconds after final assets are ready.
- Memory should remain below typical browser crash thresholds on modern laptops.

## 14. Realtime Voice and Chat

Text chat:

- Bottom floating input.
- Translucent glass surface.
- Submit icon button.
- Send user text to backend.
- Show compact assistant response.

Voice:

- Bottom floating microphone button.
- Use OpenAI Realtime API via ephemeral client secret.
- Show listening state.
- Show thinking state.
- Convert model output to assistant response and motion intent.

Floating input design:

- Fixed bottom center.
- Max width around 720px.
- Mobile safe-area aware.
- Background `rgba(19, 21, 23, 0.72)`.
- Backdrop blur 16px.
- Border `rgba(255,255,255,0.12)`.
- Must not block the pet's face or main interaction area.

Conversation behavior:

- Keep responses short.
- Favor warmth over technical explanation.
- Map commands to motion intents when possible.
- If the user says something emotional, respond gently without forcing a motion.
- If the user asks impossible actions, answer softly and maybe play `look_at_camera` or `sit`.

## 15. Rate Limits, Retries, and Job Orchestration

Long-running operations must be queued.

Requirements:

- Use provider-specific concurrency controls.
- Track requests per minute and tokens per minute when available.
- Use exponential backoff with jitter for 429 and transient 5xx errors.
- Store retry count and next retry time.
- Display retry state on the loading page in gentle, non-technical language.
- Keep raw provider names, model names, job IDs, and API error details out of the primary loading UI.
- Do not start duplicate jobs for the same artifact unless explicitly regenerating.

Example loading copy:

- "Taking another careful pass."
- "We're adjusting one part so the space feels closer to your photos."
- "Still preparing your space."
- "Some memories take a little longer to settle. We're still here."

Do not show raw provider errors to users.

## 16. Failure Handling

Recoverable failures:

- Pet ambiguity.
- One scene generation fails.
- One motion clip fails.
- Rate limit.
- Temporary provider timeout.

Non-recoverable failures:

- No valid images.
- OpenAI key invalid.
- World Labs key invalid.
- No renderable World Labs asset.
- All pet generation attempts fail.

Fallback behavior:

- If motion video generation fails, use still-image pet with idle breathing animation.
- If full 3D space fails but panorama exists, show panorama dome fallback.
- If panorama fails but thumbnail exists, show a stylized memory card fallback.
- If voice fails, keep text chat working.

## 17. Security and Privacy

Requirements:

- Never expose provider API keys to the browser.
- Use ephemeral Realtime client secrets.
- Store uploads under project-specific paths.
- Avoid public unguessable URLs if storage provider supports signed URLs.
- Do not log raw image URLs with secrets.
- Do not print `.env` values.
- Add upload size limits.
- Validate MIME type and file extension.
- Strip or ignore sensitive EXIF location metadata unless explicitly needed.

Hackathon privacy copy:

- "Your photos are used to create this memory space and are not shown publicly."

## 18. Accessibility

Requirements:

- All controls must be keyboard reachable.
- Upload must work without drag-and-drop.
- Buttons must have accessible names.
- Microphone state must have visible and screen-reader text.
- Loading progress must be announced politely.
- Chat input must have a label.
- Respect reduced motion by reducing camera easing, bloom, and animated background effects.

## 19. Analytics and Demo Observability

Track internally:

- Upload started.
- Upload completed.
- Pet selected automatically.
- Clarification required.
- Space generation started/completed/failed.
- Pet motion generation started/completed/failed.
- 3D scene entered.
- Chat message sent.
- Voice session started.
- Motion intent triggered.

For hackathon demo:

- Add a local debug panel hidden behind a keyboard shortcut.
- Show job IDs, provider status, selected asset tier, FPS, and current pet state.
- Do not show debug panel by default.

## 20. Detailed Implementation TODO

### 20.1 Project Setup

- [ ] Create Next.js TypeScript app.
- [ ] Add linting, formatting, and typecheck scripts.
- [ ] Add environment variable validation.
- [ ] Add `.env.example` without secrets.
- [ ] Add app-wide design tokens from `DESIGN.md`.
- [ ] Add base layout, metadata, and global styles.
- [ ] Add provider adapter folders for OpenAI and World Labs.
- [ ] Add shared types for projects, jobs, assets, pet state, and motion clips.

### 20.2 Storage and Database

- [ ] Use local SQLite as the default database.
- [ ] Ensure the app can run without installing any external DB service.
- [ ] Add `SQLITE_PATH` support with `./data/still-with.sqlite` default.
- [ ] Use local disk as the default object storage.
- [ ] Add `LOCAL_STORAGE_DIR` support with `./data/uploads` default.
- [ ] Add upload object path convention.
- [ ] Add image thumbnail generation.
- [ ] Add database schema for `Project`.
- [ ] Add database schema for `UploadedImage`.
- [ ] Add database schema for `PetCandidate`.
- [ ] Add database schema for `PetProfile`.
- [ ] Add database schema for `SceneCluster`.
- [ ] Add database schema for `WorldAsset`.
- [ ] Add database schema for `MotionClip`.
- [ ] Add database schema for `PetRuntimeState`.
- [ ] Add database schema for a SQLite-backed `GenerationJob` table.
- [ ] Add migration or schema initialization command.
- [ ] Add startup-time directory creation for `./data`.

### 20.3 Upload Flow

- [ ] Build upload screen in English.
- [ ] Add drag-and-drop upload.
- [ ] Add file picker upload.
- [ ] Add thumbnail preview grid.
- [ ] Add remove image action.
- [ ] Add file count validation.
- [ ] Add file size validation.
- [ ] Add upload progress.
- [ ] Add `POST /api/projects`.
- [ ] Persist uploaded images.
- [ ] Enqueue pet analysis job.

### 20.4 Pet Identification

- [ ] Implement OpenAI `gpt-5.4` pet analysis prompt.
- [ ] Define strict JSON schema.
- [ ] Parse all visible pet candidates.
- [ ] Cluster candidate identities.
- [ ] Select dominant pet.
- [ ] Store `PetProfile`.
- [ ] Add ambiguity detection.
- [ ] Build clarification UI in English.
- [ ] Add `POST /api/projects/:projectId/clarify-pet`.
- [ ] Resume pipeline after clarification.
- [ ] Add tests for single-pet photos.
- [ ] Add tests for multi-pet dominant selection.
- [ ] Add tests for ambiguous multi-pet photos.

### 20.5 Loading Screen

- [ ] Build loading screen.
- [ ] Use the title "A quiet place is being prepared".
- [ ] Use the subtitle "We're taking a little time to make this feel gentle, familiar, and safe."
- [ ] Add a quiet memory-glow visual inspired by uploaded photo colors.
- [ ] Avoid showing a pet silhouette before the experience is ready.
- [ ] Avoid large spinners, checklist-heavy UI, and technical pipeline labels.
- [ ] Add seven user-facing emotional stages from Section 6.3.
- [ ] Add a simple "Step N of 7" indicator.
- [ ] Do not show a percent counter in the primary UI.
- [ ] Add retry/backoff status using gentle copy.
- [ ] Add SSE endpoint or polling endpoint.
- [ ] Map queue events to emotional loading stages.
- [ ] Keep raw branch/job status available only in logs or hidden debug UI.
- [ ] Show clarification interrupt when needed.
- [ ] Show recoverable warnings softly.
- [ ] Show final transition into 3D scene.

### 20.6 Job Queue

- [ ] Add a SQLite-backed job table and in-process worker loop.
- [ ] Ensure no Redis or external queue service is required.
- [ ] Add job types for pet analysis.
- [ ] Add job types for scene classification.
- [ ] Add job types for scene seed generation.
- [ ] Add job types for World Labs generation.
- [ ] Add job types for pet keyframe generation.
- [ ] Add job types for video generation.
- [ ] Add job types for video post-processing.
- [ ] Add job types for quality evaluation.
- [ ] Add idempotency keys per artifact.
- [ ] Add exponential backoff with jitter.
- [ ] Add provider concurrency limits.
- [ ] Add job timeout handling.
- [ ] Add resumability after server restart if feasible.

### 20.7 Scene Classification and Seed Images

- [ ] Implement scene clustering prompt.
- [ ] Pick primary scene for MVP.
- [ ] Extract spatial details from source photos.
- [ ] Decide whether real photos are enough for World Labs multi-image input.
- [ ] Generate missing `front`, `left`, `right`, `back` views with `gpt-image-2` when needed.
- [ ] Generate panorama fallback when multi-view is unstable.
- [ ] Ensure all scene seed prompts remove pets, people, and other animals.
- [ ] Store seed image URLs.
- [ ] Evaluate seed image quality.
- [ ] Regenerate poor seed images up to 2 times.

### 20.8 World Labs Integration

- [ ] Implement World Labs client.
- [ ] Submit world generation request.
- [ ] Support multi-image input with horizontal azimuths.
- [ ] Support panorama input.
- [ ] Store operation ID.
- [ ] Poll operation status.
- [ ] Fetch completed world object.
- [ ] Store SPZ URLs.
- [ ] Store collider mesh URL.
- [ ] Store panorama URL.
- [ ] Store thumbnail URL.
- [ ] Handle World Labs failures.
- [ ] Add fallback to panorama or thumbnail if SPZ is unavailable.

### 20.9 Pet Keyframes

- [ ] Implement `gpt-image-2` pet keyframe prompt template.
- [ ] Generate `stand_idle` keyframes.
- [ ] Generate `sit` keyframes.
- [ ] Generate `sit_to_stand` keyframes.
- [ ] Generate `stand_to_sit` keyframes.
- [ ] Generate `turn_360` keyframes.
- [ ] Generate `look_at_camera` keyframes.
- [ ] Generate `walk_small` keyframes.
- [ ] Ensure chroma background.
- [ ] Ensure only the selected pet appears.
- [ ] Evaluate visual similarity to uploaded pet.
- [ ] Regenerate poor keyframes up to 2 times.

### 20.10 Video Generation

- [ ] Implement Sora provider adapter.
- [ ] Generate idle loop.
- [ ] Generate transition clips.
- [ ] Generate turn clip.
- [ ] Generate look/head motion clip.
- [ ] Generate small walk clip if time allows.
- [ ] Store raw video outputs.
- [ ] Evaluate clips for single-pet constraint.
- [ ] Evaluate clips for visual consistency.
- [ ] Evaluate clips for clean chroma background.
- [ ] Add fallback still-image animation if video generation fails.
- [ ] Add optional Seedance adapter only if API key exists.

### 20.11 Chroma/Alpha Processing

- [ ] Add FFmpeg pipeline or shader chroma-key pipeline.
- [ ] Remove green/blue background.
- [ ] Export alpha WebM if server-side path is used.
- [ ] Store processed video URL.
- [ ] Tune threshold to avoid edge halos.
- [ ] Add client fallback shader if alpha video does not play.
- [ ] Verify video loops and transitions.

### 20.12 3D Client

- [ ] Add Three.js scene component.
- [ ] Add Spark dependency.
- [ ] Load low-tier SPZ first.
- [ ] Upgrade quality tier based on device capability.
- [ ] Load collider mesh when available.
- [ ] Add camera anchor.
- [ ] Add limited drag yaw.
- [ ] Add limited pitch.
- [ ] Add slight depth movement.
- [ ] Add spring return to center.
- [ ] Add pet video plane.
- [ ] Add contact shadow.
- [ ] Add pet scaling logic.
- [ ] Add color correction for pet video.
- [ ] Add loading state for 3D assets.
- [ ] Dispose resources on unmount.
- [ ] Add FPS/debug overlay behind a keyboard shortcut.

### 20.13 Chat and Voice

- [ ] Build bottom floating chat bar.
- [ ] Add text input.
- [ ] Add microphone button.
- [ ] Add send icon button.
- [ ] Add listening state.
- [ ] Add thinking state.
- [ ] Add assistant response display.
- [ ] Implement `POST /api/projects/:projectId/chat`.
- [ ] Implement motion intent parsing with `gpt-5.4`.
- [ ] Implement Realtime ephemeral key endpoint.
- [ ] Connect browser microphone through Realtime API.
- [ ] Ensure API key never reaches browser.
- [ ] Add graceful fallback when mic permission is denied.

### 20.14 Pet State Machine

- [ ] Define motion states.
- [ ] Define allowed transitions.
- [ ] Make `stand` the hub state.
- [ ] Store current state server-side.
- [ ] Mirror current state client-side.
- [ ] Queue motion intents.
- [ ] Prevent direct incompatible jumps.
- [ ] Implement `sit -> stand -> turn -> stand`.
- [ ] Implement `stand -> sit`.
- [ ] Implement `stand -> look_at_camera`.
- [ ] Implement fallback to `stand_idle`.
- [ ] Test rapid repeated commands.

### 20.15 Quality Gates

- [ ] Add visual evaluator prompt.
- [ ] Score pet identity consistency.
- [ ] Score single-pet constraint.
- [ ] Score clean background.
- [ ] Score scene similarity.
- [ ] Score emotional tone.
- [ ] Store quality scores.
- [ ] Regenerate failed artifacts up to 2 times.
- [ ] Mark artifacts as accepted or fallback.
- [ ] Surface only user-friendly status.

### 20.16 Frontend Polish

- [ ] Ensure all visible UI copy is English.
- [ ] Match `DESIGN.md` tokens.
- [ ] Add dreamlike lighting treatment.
- [ ] Avoid card clutter.
- [ ] Ensure mobile layout works.
- [ ] Ensure floating chat does not overlap important content.
- [ ] Add reduced-motion support.
- [ ] Add keyboard accessibility.
- [ ] Add screen-reader labels.
- [ ] Add clear failure/retry copy.

### 20.17 Testing

- [ ] Unit test pet state transitions.
- [ ] Unit test provider retry/backoff.
- [ ] Unit test project status calculation.
- [ ] Integration test upload -> project creation.
- [ ] Integration test ambiguous pet clarification.
- [ ] Integration test status polling/SSE.
- [ ] Integration test chat -> motion intent.
- [ ] Browser test upload screen.
- [ ] Browser test loading screen.
- [ ] Browser test 3D scene loads.
- [ ] Browser test floating chat on mobile.
- [ ] Performance test SPZ loading tier.
- [ ] Manual test with 1 image.
- [ ] Manual test with 3+ images.
- [ ] Manual test with multiple pets.
- [ ] Manual test with rate-limit simulation.

### 20.18 Demo Readiness

- [ ] Prepare a known-good demo photo set.
- [ ] Pre-generate fallback assets for live-demo safety.
- [ ] Add demo reset command.
- [ ] Add hidden debug panel.
- [ ] Verify `.env` on demo machine.
- [ ] Verify OpenAI access.
- [ ] Verify World Labs access.
- [ ] Verify Sora access or fallback.
- [ ] Verify browser microphone permission.
- [ ] Verify network speed assumptions.
- [ ] Record backup demo video.

## 21. Mandatory Direct Verification Loop

Before the project can be considered submission-ready, run a blocker-driven direct verification loop. Do not use reviewer sub-agents for this gate; the integration owner must personally inspect the result from two perspectives.

Required verification perspectives:

- Product, UX, emotional safety, accessibility, and copy review.
- Technical architecture, AI pipeline, 3D performance, security, and reliability review.

Process:

- [ ] Implement the planned feature set.
- [ ] Run tests and browser verification.
- [ ] Directly review the code and UI from the product/UX/safety/accessibility perspective.
- [ ] Directly review the code and runtime flow from the technical/AI/3D/performance/security perspective.
- [ ] Collect all findings.
- [ ] Classify findings as blocker, high, medium, or low.
- [ ] Fix every blocker.
- [ ] Re-run relevant tests after fixes.
- [ ] Repeat direct review after blockers are fixed.
- [ ] Repeat fix -> review -> test until zero blockers remain.
- [ ] Do not submit while any blocker remains.

Blocker examples:

- User-facing UI is not English.
- Pet identity selection is unreliable for common upload sets.
- Generated motion shows multiple pets, people, or obvious wrong pet identity.
- 3D scene fails to load on the demo machine.
- API keys are exposed to the client.
- Voice/text interaction cannot trigger motion.
- Motion state jumps directly from sitting to turning without passing through standing.
- Loading screen gives no emotional progress signal or exposes cold technical pipeline language.
- Floating chat blocks the pet or breaks on mobile.
- The experience uses emotionally unsafe copy.

## 22. Acceptance Criteria

The MVP is accepted when:

- A user can upload photos and create a project.
- The system identifies the dominant pet or asks for clarification.
- The loading screen shows meaningful emotional progress with "Step N of 7" and no primary percent counter.
- The system creates or loads a World Labs memory space.
- The web client renders the 3D space smoothly enough for demo.
- The pet appears inside the space as a video or fallback animated image.
- The pet state machine preserves continuous transitions.
- The user can type to the pet.
- The user can use the microphone if Realtime API access is available.
- At least one natural-language motion command works end to end.
- All user-facing UI copy is English.
- Required API keys are not exposed.
- Direct product/UX/safety and technical verification reports zero blockers.

## 23. Open Risks

- Sora API access may not be enabled for the current OpenAI key.
- Video generation may be too slow for live demo, so fallback/pre-generated assets are required.
- Chroma-key quality may need manual tuning per generated video.
- World Labs output may not match uploaded spaces if source photos are too sparse or inconsistent.
- SPZ rendering can be heavy on mobile, so quality tiers and fallback panorama mode are required.
- User-uploaded photos with multiple similar pets may need clarification more often than expected.

## 24. Source References

- OpenAI GPT-5.4 model: https://developers.openai.com/api/docs/models/gpt-5.4
- OpenAI GPT Image 2 model: https://developers.openai.com/api/docs/models/gpt-image-2
- OpenAI image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI video generation guide: https://developers.openai.com/api/docs/guides/video-generation
- OpenAI Realtime API guide: https://developers.openai.com/api/docs/guides/realtime
- World Labs API docs: https://docs.worldlabs.ai/api
- World Labs world retrieval: https://docs.worldlabs.ai/api/reference/worlds/get
- World Labs multi-image prompt guide: https://docs.worldlabs.ai/marble/create/prompt-guides/multi-image-prompt
- World Labs panorama prompt guide: https://docs.worldlabs.ai/marble/create/prompt-guides/pano-prompt
- Spark renderer overview: https://sparkjs.dev/docs/overview/
- Spark performance guide: https://sparkjs.dev/docs/performance/
- Three.js VideoTexture: https://threejs.org/docs/pages/VideoTexture.html
