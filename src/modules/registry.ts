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

export function buildModuleRegistry(): ModuleDefinition[] {
  return [
    HomeModule,

    createPlaceholderModule({
      id: "patient-library",
      title: "Patient Library",
      description:
        "Large, searchable patient library (site, diagnosis, histology, stage, intent, " +
        "technique, modality, difficulty, competency) with case metadata.",
      order: 1,
      plannedIn: "Phase 5 — Patient Library Integration",
    }),

    createPlaceholderModule({
      id: "consultation-ois",
      title: "Consultation / OIS",
      description:
        "Worklist, demographics, diagnosis, prescription, course, fraction schedule, " +
        "imaging approvals, holds, and notes.",
      order: 2,
      plannedIn: "Phase 2 — Legacy Module Integration",
    }),

    createPlaceholderModule({
      id: "ct-simulation",
      title: "CT Simulation",
      description:
        "Patient setup, positioning, immobilization, scan range, reference marks, setup " +
        "photos, contrast protocol, and CT dataset creation/transfer.",
      order: 3,
      plannedIn: "Phase 2 — Legacy Module Integration",
    }),

    createPlaceholderModule({
      id: "dicom-studio",
      title: "DICOM Studio",
      description:
        "Unified multi-format DICOM/NIfTI viewer: stack scrolling, window/level, pan, " +
        "zoom, HU readout, measurements, MPR, and fusion.",
      order: 4,
      plannedIn: "Phase 3 — Imaging Core Extraction",
    }),

    createPlaceholderModule({
      id: "dosimetry-tps",
      title: "Dosimetry / TPS",
      description:
        "Structure creation, isocenter and beam placement, forward/inverse planning, " +
        "dose calculation, isodose display, DVH, and plan metrics.",
      order: 5,
      plannedIn: "Phase 2 — Legacy Module Integration",
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

    createPlaceholderModule({
      id: "treatment-delivery",
      title: "Treatment Delivery",
      description:
        "Record-and-verify, image guidance, gantry/couch/collimator/MLC controls, " +
        "interlocks, setup verification, and fraction delivery.",
      order: 7,
      plannedIn: "Phase 7 — Workflow and Education",
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
