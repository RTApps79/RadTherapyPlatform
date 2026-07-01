# RTApps RadTherapyPlatform

**The Ultimate Radiation Therapy Education & Simulation Platform**

> Educational simulation — not for clinical use.

RTApps RadTherapyPlatform is a browser-based radiation oncology education,
simulation, imaging, and workflow platform built around a shared patient
and imaging data model. This repository currently contains the **Phase 1 —
Platform Foundation** scaffold described in the architecture brief.

Copyright (c) 2026 Kevin Kindle. All Rights Reserved. See [`LICENSE`](./LICENSE).

## What's in Phase 1

This is the application shell and core architecture everything else plugs
into — not yet the clinical/educational modules themselves.

- **Vite + TypeScript** project, strict mode, path aliases (`@core`, `@services`, `@models`, `@modules`, `@shell`, `@config`, `@styles`)
- **Application shell** (`src/shell/AppShell.ts`) — header, workflow navigation, content area, footer, always-visible non-clinical disclaimer
- **Module host** (`src/core/ModuleHost.ts`) — mounts/unmounts registered modules by route, no direct DOM/state coupling between modules
- **Router** (`src/core/Router.ts`) — hash-based, works unmodified on GitHub Pages
- **Service container** (`src/core/ServiceContainer.ts`) — typed DI container (`ServiceToken<T>`)
- **Event bus** (`src/core/EventBus.ts`) — typed pub/sub; see `src/core/PlatformEvents.ts` for the growing event catalog
- **State store** (`src/core/StateStore.ts`) — minimal reactive store for session/selection state
- **Logging** (`src/core/Logger.ts`) — scoped, leveled logger
- **Configuration** (`src/config/AppConfig.ts`) — environment/feature-flag config
- **Theme** (`src/styles/theme.css`) — dark navy / cyan design tokens matching the product mockups
- **Branding & copyright** (`src/config/branding.ts`) — single source of truth for product name and copyright, referenced by the shell and (later) exported reports
- **Shared dataset registry** (`src/services/ImagingDatasetRegistry.ts`) — the mechanism that lets one imported dataset be reused across every module, per the brief's core architectural principle
- **Shared domain models** (`src/models/index.ts`) — Patient, Course, Prescription, ImagingStudy, Series, ImageStack, StructureSet, TreatmentPlan, Dose, TreatmentFraction, QARecord, EducationalCaseState
- **Core services** (`src/services/`) — PatientService, CourseService, StudySeriesService, ImagingDatasetRegistry, DicomImportService (interface defined now, real DICOM/NIfTI decode lands Phase 3), PlanService, WorkflowService
- **RenderingService** (`src/services/RenderingService.ts`) — shared Three.js viewport abstraction; see the live demo on the Platform Home screen (rotating gantry/isocenter mesh) as the pattern later modules (LINAC visualization, beam geometry, anatomy review) will build on
- **10 routable workflow modules** registered end-to-end (Patient Library → Consultation/OIS → CT Simulation → DICOM Studio → Dosimetry/TPS → Physics QA → Treatment Delivery → OTV/Adaptive Review → Completion → Education/Assessment) — all currently render a placeholder screen until their phase lands
- Unit tests for the core primitives (EventBus, StateStore, ServiceContainer)
- GitHub Actions CI (lint/test/build) and a GitHub Pages deploy workflow

## Getting started

```bash
npm install
npm run dev       # local dev server at http://localhost:5173
npm run test      # run unit tests
npm run lint       # lint
npm run build      # production build to dist/
npm run preview    # preview the production build locally
```

## Deploying to GitHub Pages

1. In the repo's **Settings → Pages**, set **Source** to "GitHub Actions".
2. Push to `main` — `.github/workflows/deploy.yml` builds and deploys automatically.
3. The site will be available at `https://RTApps79.github.io/RadTherapyPlatform/`.

`vite.config.ts` sets `base: "/RadTherapyPlatform/"` to match. If you rename
the repo or deploy elsewhere (custom domain, Netlify, Vercel), update `base`
accordingly (`"/"` for a domain root).

## Architecture at a glance

```
index.html
  -> src/main.ts                  bootstraps everything, in order
       - core/Logger              scoped, leveled logging
       - core/EventBus            typed pub/sub (see PlatformEvents.ts)
       - core/StateStore          session/selection state
       - core/ServiceContainer    DI container
       - services/index.ts        registerCoreServices(...)
       - core/Router              hash-based routing
       - core/ModuleHost          mounts active module by route
       - shell/AppShell           header / nav / content / footer chrome
       - modules/registry.ts      buildModuleRegistry() - all 10 workflow modules + Home
```

**Modules never talk to each other directly.** They read/write shared state
through `PatientService`, `ImagingDatasetRegistry`, `PlanService`,
`CourseService`, `WorkflowService`, publish/subscribe through the
`EventBus`, and mount their UI into the container the `ModuleHost` gives
them. This is what Phase 4 (Shared Dataset Workflow) depends on: one
imported dataset, opened without re-import, across OIS, CT Simulation,
TPS, Physics, and Treatment Delivery.

## Roadmap (from the architecture brief)

- [x] **Phase 1 - Platform Foundation** (this repository)
- [ ] **Phase 2 - Legacy Module Integration**: wrap the existing OIS and TPS as first-class modules without breaking current functionality
- [ ] **Phase 3 - Imaging Core Extraction**: `DicomImportService`, `NiftiImportService`, `ImageStackService`, `WindowLevelService`, `ViewportController`, `MeasurementService` extracted into reusable services (Cornerstone3D, dcmjs)
- [ ] **Phase 4 - Shared Dataset Workflow**: one dataset opens in OIS, CT Simulation, TPS, Physics, and Treatment Delivery with no duplicate import
- [ ] **Phase 5 - Patient Library Integration**: connect the real patient library to shared patient/imaging services
- [ ] **Phase 6 - Radiation Therapy DICOM**: RTSTRUCT, RTPLAN, RTDOSE, REG, SEG
- [ ] **Phase 7 - Workflow and Education**: assignments, scoring, instructor tools, learning analytics

## Continuing this build

This foundation is meant to be developed further with **Claude Code**
against this repo — clone it, open it in Claude Code, and work through the
phases above in order. Phase 3 (imaging) is the highest-leverage next step
per the brief, since almost everything else depends on the shared dataset
registry actually holding real pixel data.
