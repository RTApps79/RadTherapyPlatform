/**
 * RTApps RadTherapyPlatform — DICOM Import Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Phase 3 (Imaging Core Extraction) — real decoding, not placeholders.
 * Local DICOM series (via `dicom-parser`) and NIfTI volumes (gzip +
 * NIfTI-1 header/voxel parsing) are decoded into the shared `Volume`
 * shape and registered in `ImagingDatasetRegistry`, so any module that
 * resolves a dataset by id gets real, calibrated pixel data — the same
 * dataset, loaded once, usable everywhere the brief calls for (Patient
 * Library, OIS, CT Simulation, TPS, Physics, Treatment Delivery,
 * Education, Reporting).
 */

import type { Logger } from "@core/Logger";
import type { ImageStack, Series, Modality } from "@models/index";
import type { ImagingDatasetRegistry } from "./ImagingDatasetRegistry";
import type { StudySeriesService } from "./StudySeriesService";
import { loadDicomSeries } from "./imaging/dicomSeriesLoader";
import { loadNiftiVolume } from "./imaging/niftiVolumeLoader";
import { generateSyntheticPhantom } from "./imaging/syntheticPhantom";
import type { Volume } from "./imaging/Volume";

export interface ImportResult {
  imageStack: ImageStack;
  series: Series;
  volume: Volume;
  skippedFiles?: number;
}

export class DicomImportService {
  constructor(
    private readonly studySeriesService: StudySeriesService,
    private readonly datasetRegistry: ImagingDatasetRegistry,
    private readonly logger: Logger,
  ) {}

  /** Import a local DICOM series (file picker or folder/webkitdirectory input). */
  async importDicomSeries(files: FileList | File[], studyId: string, modality: Modality = "CT"): Promise<ImportResult> {
    const fileArray = Array.from(files);
    this.logger.info(`importDicomSeries: ${fileArray.length} file(s) for study "${studyId}"`);

    const { volume, skippedFiles } = await loadDicomSeries(fileArray);
    if (skippedFiles > 0) {
      this.logger.warn(`importDicomSeries: skipped ${skippedFiles} unusable file(s)`);
    }

    return this.register(studyId, modality, volume, "dicom", skippedFiles);
  }

  /** Import a NIfTI (.nii.gz) volume from a URL — e.g. the shared imaging library. */
  async importNiftiFromUrl(url: string, studyId: string, modality: Modality = "MR", label?: string): Promise<ImportResult> {
    this.logger.info(`importNiftiFromUrl: "${url}" for study "${studyId}"`);
    const volume = await loadNiftiVolume(url, label);
    return this.register(studyId, modality, volume, "nifti");
  }

  /** Register a procedurally-generated demo phantom — no upload required, always available. */
  async importSyntheticPhantom(studyId: string): Promise<ImportResult> {
    this.logger.info(`importSyntheticPhantom: for study "${studyId}"`);
    const volume = generateSyntheticPhantom();
    return this.register(studyId, "CT", volume, "unknown");
  }

  private register(
    studyId: string,
    modality: Modality,
    volume: Volume,
    sourceFormat: ImageStack["sourceFormat"],
    skippedFiles?: number,
  ): ImportResult {
    const series = this.studySeriesService.addSeries({
      studyId,
      modality,
      description: volume.meta.seriesDescription,
    });

    const imageStack: ImageStack = {
      id: crypto.randomUUID(),
      seriesId: series.id,
      sliceCount: volume.depth,
      sourceFormat,
    };

    this.datasetRegistry.register(imageStack, modality, volume);
    this.logger.info(
      `Registered dataset "${imageStack.id}" (${volume.cols}x${volume.rows}x${volume.depth}, ${volume.meta.sourceFormat})`,
    );

    return { imageStack, series, volume, skippedFiles };
  }
}
