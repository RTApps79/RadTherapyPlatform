/**
 * RTApps RadTherapyPlatform — Shared Domain Models
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Per the architecture brief, there must be ONE shared source of truth for
 * Patient, Course, Prescription, Imaging Study, Series, Image Stack,
 * Structure Set, Treatment Plan, Dose, Treatment Fraction, QA Record, and
 * Educational Case State. Every service and module imports these types
 * rather than declaring local, module-specific copies.
 *
 * Phase 1 defines these as plain data shapes (no persistence, no DICOM
 * parsing yet). Phase 3 (Imaging Core Extraction) and Phase 6 (Radiation
 * Therapy DICOM) will extend these — particularly ImagingStudy/Series and
 * StructureSet/TreatmentPlan/Dose — to carry real DICOM-derived metadata
 * without breaking this shape's public fields.
 */

export type EntityId = string;

export interface Patient {
  id: EntityId;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 date
  sex: "M" | "F" | "O" | "U";
  diagnosis?: string;
  cancerSite?: string;
  histology?: string;
  stage?: string;
  treatmentIntent?: "curative" | "palliative" | "adjuvant" | "neoadjuvant" | "other";
  /** Educational metadata — see also EducationalCaseState. */
  difficulty?: "introductory" | "intermediate" | "advanced";
  competencies?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Prescription {
  id: EntityId;
  courseId: EntityId;
  totalDoseCGy: number;
  dosePerFractionCGy: number;
  numberOfFractions: number;
  prescribingPhysician?: string;
  technique?: string; // e.g. "3D-CRT", "IMRT", "VMAT", "SBRT"
  createdAt: string;
}

export interface Course {
  id: EntityId;
  patientId: EntityId;
  courseName: string;
  prescriptionId?: EntityId;
  startDate?: string;
  status: "planned" | "in-progress" | "on-hold" | "completed" | "discontinued";
  createdAt: string;
  updatedAt: string;
}

export type Modality = "CT" | "MR" | "PET" | "CBCT" | "RTSTRUCT" | "RTPLAN" | "RTDOSE" | "REG" | "SEG" | "OTHER";

export interface ImagingStudy {
  id: EntityId;
  patientId: EntityId;
  studyInstanceUID?: string; // populated once real DICOM import lands (Phase 3+)
  studyDate?: string;
  description?: string;
  seriesIds: EntityId[];
  createdAt: string;
}

export interface Series {
  id: EntityId;
  studyId: EntityId;
  seriesInstanceUID?: string;
  modality: Modality;
  description?: string;
  imageStackId?: EntityId;
  createdAt: string;
}

export interface ImageStack {
  id: EntityId;
  seriesId: EntityId;
  sliceCount: number;
  sourceFormat: "dicom" | "nifti" | "unknown";
  /** Populated by DicomImportService/NiftiImportService in later phases. */
  frameOfReferenceUID?: string;
}

export interface StructureSet {
  id: EntityId;
  imageStackId: EntityId;
  structures: Array<{
    id: EntityId;
    name: string;
    type: "target" | "oar" | "other";
    color?: string;
  }>;
  createdAt: string;
}

export interface TreatmentPlan {
  id: EntityId;
  courseId: EntityId;
  imageStackId: EntityId;
  structureSetId?: EntityId;
  planName: string;
  planningTechnique?: "forward" | "inverse";
  status: "draft" | "in-review" | "approved" | "rejected";
  beams?: Array<{
    id: EntityId;
    name: string;
    gantryAngle: number;
    collimatorAngle: number;
    couchAngle: number;
    energyMV?: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface Dose {
  id: EntityId;
  planId: EntityId;
  doseGridReference?: string;
  dvhSummary?: Array<{
    structureId: EntityId;
    meanDoseCGy?: number;
    maxDoseCGy?: number;
    minDoseCGy?: number;
    volumeCc?: number;
  }>;
}

export interface TreatmentFraction {
  id: EntityId;
  courseId: EntityId;
  planId: EntityId;
  fractionNumber: number;
  scheduledDate?: string;
  deliveredDate?: string;
  status: "scheduled" | "delivered" | "held" | "missed";
  imagingApprovalStatus?: "pending" | "approved" | "rejected";
  therapistNotes?: string;
  physicianNotes?: string;
}

export interface QARecord {
  id: EntityId;
  planId: EntityId;
  qaType: "plan-qa" | "chart-check" | "machine-qa" | "secondary-calc";
  gammaAnalysisPassRate?: number; // percentage, e.g. 97.6
  criteria?: string; // e.g. "3%/3mm"
  result: "pass" | "fail" | "pending";
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

export interface EducationalCaseState {
  id: EntityId;
  patientId: EntityId;
  assignedTo?: string; // student/user id
  scenarioId?: string;
  embeddedErrorIds?: string[];
  workflowStage: string;
  score?: number;
  rubricResults?: Array<{ criterion: string; pointsEarned: number; pointsPossible: number }>;
  startedAt?: string;
  completedAt?: string;
}

/**
 * The canonical 10-stage workflow referenced throughout the brief and the
 * product mockups. WorkflowService uses this to drive stage transitions;
 * navigation/module order should stay aligned with it.
 */
export const WORKFLOW_STAGES = [
  "patient-library",
  "consultation-ois",
  "ct-simulation",
  "dicom-studio",
  "dosimetry-tps",
  "physics-qa",
  "treatment-delivery",
  "otv-adaptive-review",
  "completion",
  "education-assessment",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
