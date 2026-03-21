## Quick summary

This repository is a small browser-extension prototype (TypeScript) that builds into a flat `dist/` directory. Key runtime pieces:

- Background worker: `src/background/background.ts` — service-worker-style logic for MV3 (Chrome) and feature-rich background responsibilities (transcript fetch, alignment checks, usage persistence, API calls to OpenRouter).
- Content script: `src/content/content_script.ts` — injected into YouTube pages, blocks playback via an overlay (`#ss-blocker-overlay`) and asks the background to validate videos.
- UI: `src/ui/popup.ts`, `src/ui/options.ts` and HTML under `src/ui/` — popup and options pages. Options implement goal management and a quiz flow.
- Utilities: `src/utils/env_reader.ts` — lightweight `.env` loader used by the background to discover API keys (e.g. OPENROUTER_API_KEY / OPENROUTER_URL).
- Build helpers: `scripts/build.js`, `scripts/watch.js` — run `npx tsc` then bundle with `esbuild`. Outputs go to `dist/` and the build scripts can optionally copy runtime files into the project root.

## Where to start (developer workflows)

- Install deps: `npm install`
- Build (default / Chrome MV3): `npm run build` (runs `node scripts/build.js`). This runs `npx tsc` first — TypeScript errors will cause the build to fail.
- Build for Firefox (MV2 style manifest): `npm run build -- --target=firefox` or `node scripts/build.js --target=firefox`.
- Build + copy built runtime files to repository root (useful for temporary loads): `npm run build -- --overwrite-root`.
- Watch/rebuild on changes: `npm run watch` or `npm run dev` (alias to `watch:overwrite-root` in package.json).

Notes: `scripts/build.js` invokes `npx tsc` before `esbuild`. When editing TS sources, fix type errors to avoid failing the bundle step.

## Important project-specific patterns & conventions

- Messaging contract: `content_script` communicates with the background using `browser.runtime.sendMessage({ type, ... })`. The background listens with `browser.runtime.onMessage.addListener` and returns JSON-serializable results (often Promises). Common message types:
  - `fetchTranscriptAndCheck` — payload: `{ videoId }` -> returns `{ ok, aligned, score, matchedGoal, reasons }` or error flags.
  - `addUsage` — payload: `{ domain, seconds }` -> returns `{ ok: true }`.
  - `getRemainingFun` / `getSettings` / `saveSettings` / `generateQuiz` — see `src/background/background.ts` for specifics.

- Storage keys: background persists using `browser.storage.local` under keys `ss_settings` and `ss_usage`. If you change shapes, migrate carefully (see options.ts migration logic for old `goal` -> `goals`).

- Env / API keys: `src/utils/env_reader.ts` fetches a `.env` file via `browser.runtime.getURL('.env')`. For local dev put an uncommitted `.env` at the extension root (or use the options page which can store API keys in settings). Do NOT commit secrets.

- UI/DOM conventions:
  - Overlay id: `ss-blocker-overlay` (created by `content_script.ts`) — tests or modifications should use this id to find/remove the blocker overlay.
  - Video detection: `getYouTubeVideoId()` looks at `location` for `v` param or `youtu.be` path — keep this logic when changing how IDs are resolved.

## Build & runtime tips for editing

- To iterate quickly and load the extension temporarily in Firefox/Chrome:
  1. Run `npm run build -- --overwrite-root` (or `npm run dev` to watch and copy).
  2. Load unpacked extension: Chrome → `chrome://extensions` (Developer mode), choose project root; Firefox → `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" and pick `manifest.json`.
- Inspect runtime logs: use the browser's extension debugging UI. For Firefox, inspect the background scripts from `about:debugging` (for MV2 background scripts) or `Service Worker` console when using MV3 builds copied to root.

## Examples of safe edits and where to change them

- Add a new message type: update `src/background/background.ts` inside the `onMessage` handler and consume from `src/content/content_script.ts` or UI files via `browser.runtime.sendMessage`. Always return JSON-serializable objects (no DOM nodes, circular data).
- If you add new build inputs (new entry points), update `scripts/build.js` and `scripts/watch.js` `builds` arrays so they get bundled and copied into `dist/`.

## Files to inspect first when debugging or extending

- `src/background/background.ts` — core logic: transcript fetching, OpenRouter calls, storage keys and alignment/quiz logic.
- `src/content/content_script.ts` — injection, overlay, play/pause hooks, usage tracking (10s aggregation) and calls to the background.
- `src/ui/options.ts` — the admin UI, goal validation logic (validateGoal), quiz generation flow and migration code paths.
- `scripts/build.js` / `scripts/watch.js` — how bundling/copying happens (flags: `--target`, `--overwrite-root`, `--once`).
- `src/utils/env_reader.ts` — how `.env` is parsed and loaded at runtime.

## Quick contracts (useful for an AI agent)

- Message: `{ type: 'fetchTranscriptAndCheck', videoId }` -> response: `{ ok: boolean, aligned?: boolean, score?: number, matchedGoal?: number, reasons?: string }`
- Storage: settings stored under `ss_settings` (object with `goals` array, `funLimitMinutes`, `blockingEnabled`, etc.)

## Small gotchas discovered in repo

- The build script runs `npx tsc` and will fail the build if types are broken — fix types rather than bypassing.
- There are two manifests used for different targets; `manifest.json` (dev / MV3) and a Firefox/MV2 variant used for temporary loads — pick the correct target when building.

If anything here is unclear or you'd like the instructions to include more examples (e.g. a concrete change + build + load cycle), tell me which area to expand and I will iterate.
