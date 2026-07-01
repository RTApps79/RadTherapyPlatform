/**
 * RTApps RadTherapyPlatform — DICOM Import Service
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Phase 1 defines the import contract (local file, folder, and hosted
 * URL/manifest import) so every module can be written against a stable
 * API today. The actual decode pipeline — dcmjs for DICOM CT, Siemens IMA
 * support, and NIfTI/NIfTI-segmentation loading via a NiftiImportService —
 * is Phase 3 (Imaging Core Extraction) work.
 *
 * Until Phase 3 lands, `importLocalFiles`/`importFolder`/`importFromUrl`
 * register a *placeholder* ImageStack (no real pixel data) so the shared
 * dataset workflow — one dataset, opened across OIS/CT-Sim/TPS/Physics/
 * Treatment Delivery — can be built, wired, and tested end-to-end before
 * the decoder exists.
 */

import type { Logger } from "@core/Logger";
import type { ImageStack, Series, Modality } from "@models/index";
import type { ImagingDatasetRegistry } from "./ImagingDatasetRegistry";
import type { StudySeriesService } from "./StudySeriesService";

export interface ImportResult {
  imageStack: ImageStack;
  series: Series;
}

export interface DicomManifestSource {
  manifestUrl: string;
}

export class DicomImportService {
  constructor(
    private readonly studySeriesService: StudySeriesService,
    private readonly datasetRegistry: ImagingDatasetRegistry,
    private readonly logger: Logger,
  ) {}

  /** Import from a browser file picker (`<input type="file" multiple>` FileList). */
  async importLocalFiles(files: FileList | File[], studyId: string, modality: Modality = "CT"): Promise<ImportResult> {
    const fileArray = Array.from(files);
    this.logger.info(`importLocalFiles: ${fileArray.length} file(s) for study "${studyId}"`, {
      names: fileArray.map((f) => f.name),
    });
    return this.registerPlaceholder(studyId, modality, fileArray.length || 1, "dicom");
  }

  /** Import an entire folder (webkitdirectory input, or drag-and-drop of a directory). */
  async importFolder(files: FileList | File[], studyId: string, modality: Modality = "CT"): Promise<ImportResult> {
    return this.importLocalFiles(files, studyId, modality);
  }

  /** Import from a hosted URL or a study manifest (JSON list of instance URLs). */
  async importFromUrl(source: DicomManifestSource, studyId: string, modality: Modality = "CT"): Promise<ImportResult> {
    this.logger.info(`importFromUrl: "${source.manifestUrl}" for study "${studyId}"`);
    return this.registerPlaceholder(studyId, modality, 1, "dicom");
  }

  /** Import a NIfTI (.nii/.nii.gz) volume, optionally paired with a segmentation. */
  async importNifti(files: FileList | File[], studyId: string, modality: Modality = "CT"): Promise<ImportResult> {
    const fileArray = Array.from(files);
    this.logger.info(`importNifti: ${fileArray.length} file(s) for study "${studyId}"`);
    return this.registerPlaceholder(studyId, modality, fileArray.length || 1, "nifti");
  }

  private async registerPlaceholder(
    studyId: string,
    modality: Modality,
    sliceCount: number,
    sourceFormat: ImageStack["sourceFormat"],
  ): Promise<ImportResult> {
    const series = this.studySeriesService.addSeries({ studyId, modality });

    const imageStack: ImageStack = {
      id: crypto.randomUUID(),
      seriesId: series.id,
      sliceCount: Math.max(sliceCount, 1),
      sourceFormat,
    };

    this.datasetRegistry.register(imageStack, modality);
    this.logger.warn(
      "Registered a PLACEHOLDER dataset — no pixel data decoded yet. " +
        "Real DICOM/NIfTI decoding arrives in Phase 3 (Imaging Core Extraction).",
    );

    return { imageStack, series };
  }
}
