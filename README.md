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

3. Build (produce files in `dist/`):

```bash
npm run build
```

4. Load the extension for development in Firefox (recommended test flow):

	- Run the build first so `dist/` contains the bundled runtime files:

	```bash
	npm run build
	```

	- Open Firefox and go to `about:debugging#/runtime/this-firefox`.
	- Click "Load Temporary Add-on" and select the project's `manifest.json` (project root). Firefox will register the extension using the paths in `manifest.json` (which reference `dist/` for service worker and content scripts).

	- To view background/service worker logs: on the same `about:debugging` page, find the loaded extension and click "Inspect" (this opens devtools for the extension service worker). Use that console for `console.log` messages from the background worker.

	- To see content script logs, open the web page (e.g., YouTube) and open the page's DevTools Console — content script messages will appear there.

Quick start — Chrome (unchanged)
- Open `chrome://extensions`, enable Developer mode, click "Load unpacked", and select the project root. Make sure you ran `npm run build` first so `dist/` files exist.

Build options and watch mode

```bash
# Build once
npm run build

# Build + overwrite runtime root (copies built files to project root as well)
npm run build -- --overwrite-root

# Watch mode (esbuild watch + static file copy)
npm run watch

# Watch + overwrite runtime root
npm run watch -- --overwrite-root
```

Notes and recommendations
- `dist/` is generated; edit `src/` (TypeScript) — do not edit `dist/` files directly.
- The build now uses Node.js runners and `esbuild` as a runtime dependency. You no longer need `ts-node` to run the build scripts.
- I removed redundant `.js` source copies in `src/` to avoid duplication. If you relied on those files, use the compiled outputs in `dist/` (or run `npm run build`).

Security and dependency hygiene
- `esbuild` has been upgraded to `^0.27.4` to address a known advisory (GHSA). After the upgrade, `npm audit` reports no remaining vulnerabilities.

Testing the extension on Firefox
Follow these steps to test locally on Firefox.

1) Prerequisites

- Firefox (latest recommended)
- Node.js and npm
- The project checked out locally and dependencies installed (`npm install`).

2) Build the extension

```bash
npm install
npm run build
```

3) Load the extension in Firefox

- Open Firefox and navigate to: `about:debugging#/runtime/this-firefox`.
- Click "Load Temporary Add-on".
- In the file picker, choose the repository's `manifest.json` (from the project root).

Notes while testing
- The manifest references service worker and content scripts under `dist/`, so ensure `npm run build` completed successfully before loading.
- To see background worker logs: on the `about:debugging` page, click "Inspect" for the loaded extension. This opens DevTools attached to the service worker where `console.log` output appears.
- To see content-script logs: open a matching page (e.g., a YouTube video) and open the page's DevTools Console.
- If you want the extension to reference UI files from the project root (instead of `src/` -> `dist/`), run the build with `--overwrite-root` to copy built files into the repository root (legacy layout). Example:

```bash
npm run build -- --overwrite-root
```

Troubleshooting
- If the extension doesn't appear or behaves unexpectedly after loading, rebuild (`npm run build`), then Reload the temporary add-on from `about:debugging`.
- Check both the extension service worker console and the page console for errors.

Developer workflow notes
- Files to edit: `src/` (TypeScript). Build output: `dist/`.
- Build: `npm run build` (bundles TypeScript entries, copies static files).
- Watch: `npm run watch` (esbuild watch + static file copying).

Optional improvements you can request
- Add `manifest.dev.json` that points UI pages to `src/` for a more convenient dev iteration without building.
- Add a `prepare` script to run the build automatically before packaging.

Generated on: 2026-03-21

````
