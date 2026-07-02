/**
 * RTApps RadTherapyPlatform — Patient Library Record
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * This is the rich, full-detail record type for the comprehensive patient
 * library dataset (demographics, diagnosis, treatment plan, CT simulation,
 * dosimetry, daily fractions, labs, and progress notes). It is deliberately
 * separate from — and richer than — the lightweight `Patient` model in
 * `./index.ts`: `Patient` is the cross-module "who is currently selected"
 * identity shared via PatientService/EventBus, while `PatientLibraryRecord`
 * is the full chart content the Patient Library and OIS modules render.
 *
 * The source dataset was hand-authored across 33 diverse teaching cases and
 * isn't perfectly uniform field-to-field (some cases carry extra fields
 * like `receptorStatus` or `psaAtDiagnosis` that others don't). Known,
 * commonly-present fields are typed explicitly for the list/search/detail
 * UI; nested objects also accept additional unknown string-keyed fields
 * rather than forcing every record into an identical rigid shape.
 */

export interface PatientLibraryDemographics {
  name: string;
  dob: string;
  gender: string;
  address?: string;
  phone?: string;
  insurance?: string;
  referringPhysician?: string;
  emergencyContact?: string;
  advanceDirectives?: string;
  supportServices?: string;
  mobility?: string;
  [key: string]: unknown;
}

export interface PatientLibraryDiagnosis {
  primary: string;
  location?: string;
  datePathologicDiagnosis?: string;
  tumorSize?: string;
  grade?: string;
  pathologicStage?: string;
  tnmStage?: string;
  overallStage?: string;
  symptomsAtPresentation?: string;
  pathologyFindings?: string[];
  relevantHistory?: string;
  baselineStatus?: string;
  [key: string]: unknown;
}

export interface PatientLibraryTreatmentPlan {
  radOnc?: string;
  treatmentSite?: string;
  intent?: string;
  modality?: string;
  totalDose?: string;
  fractionation?: string;
  rtRxDetails?: string;
  targetVolumeSummary?: string;
  techniqueSummary?: string;
  concurrentChemo?: string;
  medications?: string[];
  therapistAlerts?: string[];
  [key: string]: unknown;
}

export interface PatientLibraryRecord {
  id: string;
  demographics: PatientLibraryDemographics;
  diagnosis: PatientLibraryDiagnosis;
  treatmentPlan: PatientLibraryTreatmentPlan;
  ctSimulation?: Record<string, unknown>;
  dosimetry?: Record<string, unknown>;
  fractions?: Array<Record<string, unknown>>;
  labResults?: Array<Record<string, unknown>>;
  progressNotes?: Array<Record<string, unknown>>;
  /** Free-text search hint from the source dataset; often empty — search should not rely on this alone. */
  search?: string;
}
