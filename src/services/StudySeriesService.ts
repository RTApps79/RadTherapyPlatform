/**
 * RTApps RadTherapyPlatform — Study/Series Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Indexes ImagingStudy and Series records. This is intentionally separate
 * from ImagingDatasetRegistry: this service is the *catalog* (what studies/
 * series exist for a patient), while the registry holds the loaded pixel
 * data / dataset handles those series point to. Keeping them distinct means
 * a study can be listed and browsed before its dataset is ever imported.
 */

import type { ImagingStudy, Series, EntityId } from "@models/index";

export class StudySeriesService {
  private studies = new Map<EntityId, ImagingStudy>();
  private series = new Map<EntityId, Series>();

  createStudy(input: Omit<ImagingStudy, "id" | "seriesIds" | "createdAt">): ImagingStudy {
    const study: ImagingStudy = {
      ...input,
      id: crypto.randomUUID(),
      seriesIds: [],
      createdAt: new Date().toISOString(),
    };
    this.studies.set(study.id, study);
    return study;
  }

  /**
   * Get an existing study by a caller-chosen id, creating it on first use
   * if it doesn't exist yet. `createStudy()` always self-generates its id,
   * which is right for patient-linked studies (OIS/Patient Library flows)
   * but doesn't fit callers — like DicomImportService's ad-hoc loads —
   * that want a stable, predictable id (e.g. "dicom-studio-upload") to
   * key repeated imports against, not tied to a specific patient record.
   */
  getOrCreateStudy(id: EntityId, patientId: EntityId = "unassigned"): ImagingStudy {
    const existing = this.studies.get(id);
    if (existing) return existing;

    const study: ImagingStudy = {
      id,
      patientId,
      seriesIds: [],
      createdAt: new Date().toISOString(),
    };
    this.studies.set(id, study);
    return study;
  }

  addSeries(input: Omit<Series, "id" | "createdAt">): Series {
    const study = this.studies.get(input.studyId);
    if (!study) throw new Error(`StudySeriesService: no study with id "${input.studyId}"`);

    const series: Series = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.series.set(series.id, series);
    study.seriesIds.push(series.id);
    return series;
  }

  getStudy(id: EntityId): ImagingStudy | undefined {
    return this.studies.get(id);
  }

  getSeries(id: EntityId): Series | undefined {
    return this.series.get(id);
  }

  listStudiesForPatient(patientId: EntityId): ImagingStudy[] {
    return [...this.studies.values()].filter((s) => s.patientId === patientId);
  }

  listSeriesForStudy(studyId: EntityId): Series[] {
    const study = this.studies.get(studyId);
    if (!study) return [];
    return study.seriesIds
      .map((id) => this.series.get(id))
      .filter((s): s is Series => s !== undefined);
  }
}
