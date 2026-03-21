# Smart Site Blocker

Smart Site Blocker is a small browser extension prototype that helps manage and limit distraction on sites such as YouTube while promoting learning-focused usage.

Purpose
- Provide a lightweight extension that can be iterated on from `src/` during development.
- Use the build helpers to produce a flat `dist/` output suitable for packaging and distribution.

Project layout (important files)
- `manifest.json` — extension manifest. For development this project references files under `src/`.
- `src/` — source files: `background/`, `content/`, `ui/`, and `utils/`.
- `scripts/` — simple build/watch helpers that copy `src/` -> `dist/`.
- `dist/` — build output (auto-generated). This directory is intentionally ignored by default to avoid committing generated files.

Quick start — development
1. Edit sources under `src/`.
2. Load the extension for development:
	- Firefox: open `about:debugging#/runtime/this-firefox`, choose "Load Temporary Add-on" and select `manifest.json` from the project root.
	- Chrome: open `chrome://extensions`, enable Developer mode, click "Load unpacked" and select this project root.

Quick start — build/package
1. Install dev dependencies (one-time):

```bash
npm install
```

2. Produce a distributable copy in `dist/` (TypeScript sources are compiled with esbuild):

````markdown
# Smart Site Blocker

Smart Site Blocker is a browser extension prototype that helps manage and limit distraction on sites such as YouTube while promoting learning-focused usage.

Purpose
- Provide a lightweight extension that can be iterated on from `src/` during development.
- Use build helpers to produce a flat `dist/` output suitable for packaging and distribution.

Repository layout (important files)
- `manifest.json` — extension manifest (references built runtime files in `dist/` for background/content).
- `src/` — TypeScript source files: `background/`, `content/`, `ui/`, and `utils/` (canonical source).
- `scripts/` — Node.js build/watch runners (use `node scripts/build.js` or `npm run build`).
- `dist/` — build output (auto-generated). This directory is intentionally ignored by default to avoid committing generated files.

What changed recently
- Build/watch runners were converted to plain Node.js (no `ts-node` required). Use `node scripts/build.js` or `npm run build`.
- `esbuild` was moved to `dependencies` and upgraded to `^0.27.4` to address a security advisory.
- Redundant generated `.js` copies in `src/` were removed; the TypeScript files under `src/` are canonical.

Quick start — development
1. Edit sources under `src/`.
2. Install dependencies (one-time):

```bash
npm install
```

# Smart Site Blocker

Smart Site Blocker is a browser extension prototype that helps manage and limit distraction on sites such as YouTube while promoting learning-focused usage.

Overview
- Edit TypeScript sources under `src/`. Build outputs go to `dist/` and are used at runtime.
- The project provides two manifest variants so you can test in Firefox (MV2 temporary add-on) and keep MV3 for Chrome.

Repository layout (important files)
- `manifest.json` — default Manifest V3 (used for Chrome / MV3-capable browsers).
- `manifest.firefox.json` — Manifest V2 (for Firefox temporary installs that block MV3 service workers).
- `src/` — TypeScript source files: `background/`, `content/`, `ui/`, and `utils/`.
- `scripts/` — Node.js build/watch runners. `scripts/build.js` now accepts `--target=chrome|firefox`.
- `dist/` — build output (auto-generated).

Quick start
1. Install dependencies (one-time):

```bash
npm install
```

2. Build (produce files in `dist/`):

```bash
npm run build
```

Build targets
- Default (Chrome/MV3):

```bash
node scripts/build.js
# or
npm run build
```

- Firefox (generate MV2 manifest into `dist/`):

```bash
node scripts/build.js --target=firefox
# or
npm run build -- --target=firefox
```

- Useful flag: `--overwrite-root` will also copy built runtime files and the chosen manifest to the project root (handy for rapid temporary loads):

```bash
node scripts/build.js --target=firefox --overwrite-root
```

Loading the extension
- Firefox (temporary add-on):
  - Build with `--target=firefox` (or rename `manifest.firefox.json` -> `manifest.json`), then open `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" and pick the repository's `manifest.json` (or the `dist/manifest.json`).
  - Inspect the background worker via the "Inspect" link on the about:debugging page to see `console.log` output.

- Chrome:
  - Build (default target), then open `chrome://extensions`, enable Developer mode, click "Load unpacked" and choose the project root.

Commands summary

```bash
# Build (default chrome)
npm run build

# Build for firefox (MV2 manifest)
npm run build -- --target=firefox

# Build + copy built files to project root
npm run build -- --overwrite-root

# Watch mode (rebuilds on change)
npm run watch
```

Notes
- `dist/` is generated — edit `src/` (TypeScript). Do not edit `dist/` directly.
- `manifest.firefox.json` is MV2 and intended only for temporary installs/testing in Firefox. Keep `manifest.json` as MV3 for Chrome/modern browsers.
- If you want, I can add `manifest.dev.json` or update `scripts/watch.js` to support `--target` as well.

Generated on: 2026-03-21
