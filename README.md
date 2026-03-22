# Smart Site Blocker

A browser extension that limits distraction on YouTube by enforcing daily watch-time limits and checking whether videos align with your learning goals.

## Features

- **Daily time limit** — set a daily "fun time" budget for YouTube. Once exceeded, only educational videos are allowed.
- **Goal alignment check** — when your limit is reached, the extension fetches the video's transcript and uses the Cerebras AI API to decide whether it matches your learning goals. Silent overlay is shown while checking (no audio plays).
- **YouTube Shorts blocking** — optionally block all Shorts.
- **Goal management** — add, edit, reorder, and delete learning goals. Goals are validated by the AI before saving.
- **Quiz** — generate a short quiz based on your goals; passing it temporarily disables blocking.
- **Keyboard shortcut** — `Cmd+Shift+L` (Mac) / `Ctrl+Shift+L` opens settings.

## Requirements

- A [Cerebras](https://cerebras.ai) API key for AI-powered alignment checks and quiz generation.
- Create a `.env` file in the project root:

```
CEREBRAS_API_KEY=your_key_here
```

Without a key, the extension falls back to basic keyword matching for alignment and static fallback quiz questions.

## Project layout

```
manifest.json          — MV2 manifest (Firefox / default)
manifest.dev.json      — MV3 manifest (Chrome dev)
src/
  background/          — service worker: AI calls, storage, usage tracking
  content/             — content script injected into YouTube pages
  ui/                  — options page, popup, styles
  utils/               — .env loader
scripts/               — Node.js build & watch helpers
dist/                  — build output (auto-generated, do not edit)
```

## Quick start

1. Install dependencies (one-time):

```bash
npm install
```

2. Add your Cerebras API key to `.env` (see Requirements above).

3. Build:

```bash
npm run build
```

## Loading the extension

**Chrome (MV3):**
- Build with the default target, then open `chrome://extensions`, enable Developer mode, click "Load unpacked" and select the project root.

**Firefox (MV2 temporary add-on):**
- Build with `--target=firefox`, then open `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" and select `manifest.json`.

## Build commands

```bash
# Default build (Chrome MV3)
npm run build

# Firefox build (copies MV2 manifest to dist/)
npm run build -- --target=firefox

# Copy built files to project root (useful for quick Firefox reloads)
npm run build -- --overwrite-root

# Watch mode (rebuilds on source changes)
npm run watch
```

## Permissions used

| Permission | Reason |
|---|---|
| `storage` | Save settings and daily usage data |
| `tabs` | Open the options page in a new tab |
| `activeTab` | Detect the current YouTube tab |
| `*://*.youtube.com/*` | Inject content script; fetch transcripts from YouTube |
| `*://youtu.be/*` | Handle short YouTube links |
| `*://api.cerebras.ai/*` | Send transcripts for AI alignment checks and quiz generation |

## Code quality — SonarCloud

This project uses [SonarCloud](https://sonarcloud.io) for static analysis.

### Setup (one-time, local only)

`sonar-project.properties` is gitignored. Create it from the template:

```bash
cp sonar-project.properties.example sonar-project.properties
```

Minimum required content:

```properties
sonar.projectKey=vg-fish_smart-website-blocker
sonar.organization=vg-fish
sonar.projectName=Smart Website Blocker
sonar.projectVersion=0.1.0
sonar.sources=src
sonar.exclusions=node_modules/**,dist/**
sonar.typescript.tsconfigPath=tsconfig.json
```

Export your token (never hardcode it):

```bash
export SONAR_TOKEN=your_token_here
```

### Running the scan

```bash
npm run sonar
```
