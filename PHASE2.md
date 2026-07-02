# Phase 2 — Legacy Module Integration

This adds the legacy-wrapping mechanism itself. It does **not** yet contain
your real OIS/TPS files — those are local-only right now. This is the
checklist to finish the wire-up, meant to be worked through directly (by
you or by Claude Code pointed at both this repo and your local legacy
folders).

## What's already done (in this drop)

- `src/modules/legacy/LegacyIframeModule.ts` — wraps any static HTML/JS
  app as a `ModuleDefinition`, mounted in an isolated iframe. No changes
  to legacy code required for this step.
- `src/modules/legacy/legacyBridge.ts` — an **optional** postMessage
  contract for later two-way sync between the shell and a legacy app.
  Not required to get the app displaying and working.
- `src/modules/registry.ts` — `consultation-ois` and `dosimetry-tps` now
  point at `createLegacyIframeModule(...)` instead of the placeholder
  factory.
- `public/legacy/ois/index.html` and `public/legacy/tps/index.html` —
  placeholder pages so the build doesn't break before real files land.

## What's left to do

1. **Copy your OIS build's files** into `public/legacy/ois/`, overwriting
   the placeholder `index.html` with the real one, preserving whatever
   relative folder structure it already uses for its own CSS/JS/images
   (e.g. `public/legacy/ois/css/`, `public/legacy/ois/js/`, etc. — copy
   the whole thing as-is). Same for TPS under `public/legacy/tps/`.

2. **Sanity-check relative paths.** Because each app runs in its own
   iframe with its own document, its internal relative links
   (`./css/app.css`, `./js/app.js`, `img/logo.png`, ...) resolve against
   the iframe's own URL — not the parent shell's `/RadTherapyPlatform/`
   base path. No changes needed *unless* the legacy app hardcodes any
   **absolute** paths (starting with `/`) — those would need to become
   relative, or be prefixed with `/RadTherapyPlatform/legacy/ois/` to
   survive the GitHub Pages subpath.

3. **If either app's entry file isn't literally `index.html`,** update
   the `srcPath` in `src/modules/registry.ts` for that module to match
   (e.g. `srcPath: "legacy/ois/main.html"`).

4. **Run it locally and click through both modules:**
   ```bash
   npm run dev
   ```
   Confirm the OIS and TPS load and behave exactly as they do standalone.

5. **If you have a separate legacy CT Simulation app** (the brief lists
   it among assets to preserve, but it wasn't confirmed as part of this
   drop), the same pattern applies — add a third
   `createLegacyIframeModule({...})` call in `registry.ts` for
   `ct-simulation`, pointed at `public/legacy/ct-simulation/index.html`.

6. **Commit and push.** CI will lint/test/build; the deploy workflow will
   publish the updated site automatically.

## Deferred to a later increment (not required now)

- **Two-way bridge**: wiring the legacy apps to react to platform events
  (e.g. OIS auto-loading the patient selected in Patient Library) via
  `legacyBridge.ts`. Requires adding a small `<script>` to each legacy
  page that posts/listens against the `rtapps-legacy-bridge` message
  shape. Do this once the basic wrap is confirmed working.
- **Phase 3 — Imaging Core Extraction**: this is where DICOM/viewer logic
  actually gets pulled out of the legacy OIS into the shared
  `ImagingDatasetRegistry`/`DicomImportService`, replacing placeholder
  pixel data with real decoded datasets shared across every module.
