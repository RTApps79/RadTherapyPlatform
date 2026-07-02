/**
 * RTApps RadTherapyPlatform — Patient Library Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Loads the comprehensive patient library dataset (33 diverse teaching
 * cases with full demographics/diagnosis/treatment/CT-sim/dosimetry/
 * fraction/lab/note detail) and bridges "open this case" actions into the
 * platform's shared PatientService, CourseService, and WorkflowService —
 * the same services every other module reads from — so selecting a
 * patient here is a real, shared platform action, not a local list click.
 */

import type { Logger } from "@core/Logger";
import type { PatientLibraryRecord } from "@models/patientLibrary";
import type { Patient } from "@models/index";
import type { PatientService } from "./PatientService";
import type { WorkflowService } from "./WorkflowService";

export interface PatientLibrarySearchFilters {
  freeText?: string;
  treatmentSite?: string;
  intent?: string;
}

const DATA_URL = `${import.meta.env.BASE_URL}data/patient-library/patients.json`;

function inferSex(gender: string | undefined): Patient["sex"] {
  const g = (gender ?? "").toLowerCase();
  if (g.startsWith("m")) return "M";
  if (g.startsWith("f")) return "F";
  return "U";
}

function inferTreatmentIntent(intent: string | undefined): Patient["treatmentIntent"] {
  const i = (intent ?? "").toLowerCase();
  if (i.includes("pallia")) return "palliative";
  if (i.includes("neoadjuv")) return "neoadjuvant";
  if (i.includes("adjuv")) return "adjuvant";
  if (i.includes("cur") || i.includes("definitive")) return "curative";
  return "other";
}

export class PatientLibraryService {
  private records: PatientLibraryRecord[] | null = null;
  private loadPromise: Promise<PatientLibraryRecord[]> | null = null;
  private readonly log: Logger;

  constructor(
    private readonly patientService: PatientService,
    private readonly workflowService: WorkflowService,
    logger: Logger,
  ) {
    this.log = logger.scope("PatientLibraryService");
  }

  /** Load (and cache) the full dataset. Safe to call repeatedly — only fetches once. */
  async loadAll(): Promise<PatientLibraryRecord[]> {
    if (this.records) return this.records;
    if (!this.loadPromise) {
      this.loadPromise = fetch(DATA_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load patient library data (${res.status})`);
          return res.json() as Promise<PatientLibraryRecord[]>;
        })
        .then((records) => {
          this.records = records;
          this.log.info(`Loaded ${records.length} patient library records`);
          return records;
        })
        .catch((err) => {
          this.loadPromise = null; // allow retry on next call
          throw err;
        });
    }
    return this.loadPromise;
  }

  async getById(id: string): Promise<PatientLibraryRecord | undefined> {
    const all = await this.loadAll();
    return all.find((r) => r.id === id);
  }

  async search(filters: PatientLibrarySearchFilters): Promise<PatientLibraryRecord[]> {
    const all = await this.loadAll();
    return all.filter((r) => {
      if (filters.freeText) {
        const haystack = [
          r.demographics?.name,
          r.diagnosis?.primary,
          r.diagnosis?.location,
          r.treatmentPlan?.treatmentSite,
          r.search,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(filters.freeText.toLowerCase())) return false;
      }
      if (filters.treatmentSite && r.treatmentPlan?.treatmentSite !== filters.treatmentSite) return false;
      if (filters.intent && inferTreatmentIntent(r.treatmentPlan?.intent) !== filters.intent) return false;
      return true;
    });
  }

  /**
   * Open a case: registers/updates the corresponding lightweight Patient
   * in the shared PatientService (using the library record's own id, so
   * it matches what the OIS bridge and other modules expect), selects it
   * (fires patient:selected, which main.ts syncs into shared state), and
   * starts a workflow case.
   */
  async openCase(id: string): Promise<PatientLibraryRecord> {
    const record = await this.getById(id);
    if (!record) {
      throw new Error(`PatientLibraryService: no record with id "${id}"`);
    }

    const [firstName = "Unknown", ...rest] = (record.demographics.name || "Unknown Patient").split(" ");
    const lastName = rest.join(" ") || "—";

    this.patientService.upsert({
      id: record.id,
      mrn: record.id,
      firstName,
      lastName,
      dateOfBirth: record.demographics.dob || "",
      sex: inferSex(record.demographics.gender),
      diagnosis: record.diagnosis?.primary,
      cancerSite: record.treatmentPlan?.treatmentSite,
      stage: record.diagnosis?.pathologicStage ?? record.diagnosis?.overallStage,
      treatmentIntent: inferTreatmentIntent(record.treatmentPlan?.intent),
    });

    this.patientService.select(record.id);
    this.workflowService.startCase(`case-${record.id}`, record.id);

    this.log.info(`Opened case for patient "${record.id}" (${record.demographics.name})`);
    return record;
  }
}
