/**
 * RTApps RadTherapyPlatform — Module Registry
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Assembles the full module list for the ModuleHost. Order here matches
 * the core workflow from the architecture brief:
 * Patient Library -> Consultation/OIS -> CT Simulation -> DICOM Studio ->
 * Dosimetry/TPS -> Physics QA -> Treatment Delivery -> OTV/Adaptive Review
 * -> Completion -> Education/Assessment
 *
 * As each phase lands, swap the corresponding `createPlaceholderModule(...)`
 * entry for a real module import — nothing else in the platform needs to
 * change, since ModuleHost/Router only ever see a ModuleDefinition.
 */

import type { ModuleDefinition } from "@core/types";
import { HomeModule } from "./home/HomeModule";
import { createPlaceholderModule } from "./placeholder/PlaceholderModule";
import { createLegacyIframeModule } from "./legacy/LegacyIframeModule";
import { PatientLibraryModule } from "./patient-library/PatientLibraryModule";
import { DicomStudioModule } from "./dicom-studio/DicomStudioModule";

export function buildModuleRegistry(): ModuleDefinition[] {
  return [
    HomeModule,

    PatientLibraryModule,

    createLegacyIframeModule({
      id: "consultation-ois",
      title: "Consultation / OIS",
      description:
        "Worklist, demographics, diagnosis, prescription, course, fraction schedule, " +
        "imaging approvals, holds, and notes.",
      order: 2,
      srcPath: "legacy/ois/index.html",
    }),

    createLegacyIframeModule({
      id: "ct-simulation",
      title: "CT Simulation",
      description:
        "3D CT simulator: patient positioning, couch/gantry motion, respiratory motion, " +
        "isocenter setup, and a live MR slice preview that tracks couch position during scan.",
      order: 3,
      srcPath: "legacy/ct-simulation/index.html",
    }),

    DicomStudioModule,

    createLegacyIframeModule({
      id: "dosimetry-tps",
      title: "Dosimetry / TPS",
      description:
        "Structure creation, isocenter and beam placement, forward/inverse planning, " +
        "dose calculation, isodose display, DVH, and plan metrics.",
      order: 5,
      srcPath: "legacy/tps/index.html",
    }),

    createPlaceholderModule({
      id: "physics-qa",
      title: "Physics QA",
      description:
        "Plan QA, chart checks, secondary calculations, machine QA, tolerance review, " +
        "approval workflows, and error-detection exercises.",
      order: 6,
      plannedIn: "Phase 7 — Workflow and Education",
    }),

    createLegacyIframeModule({
      id: "treatment-delivery",
      title: "Treatment Delivery",
      description:
        "LINAC treatment console: interlocks, MU delivery, beam's-eye-view/MLC, " +
        "IGRT image matching with couch correction, and a setup/triangulation exercise.",
      order: 7,
      srcPath: "legacy/treatment-delivery/index.html",
    }),

    createPlaceholderModule({
      id: "otv-adaptive-review",
      title: "OTV / Adaptive Review",
      description: "On-treatment visit and adaptive review checkpoints within the treatment course.",
      order: 8,
      plannedIn: "Phase 7 — Workflow and Education",
    }),

    createPlaceholderModule({
      id: "completion",
      title: "Completion",
      description: "Course completion summary and case manifest export/import.",
      order: 9,
      plannedIn: "Phase 7 — Workflow and Education",
    }),

    createPlaceholderModule({
      id: "education-assessment",
      title: "Education / Assessment",
      description:
        "Assignments, scenarios, embedded errors, scoring, competency tracking, rubrics, " +
        "instructor dashboards, and learning analytics.",
      order: 10,
      plannedIn: "Phase 7 — Workflow and Education",
    }),
  ];
}
