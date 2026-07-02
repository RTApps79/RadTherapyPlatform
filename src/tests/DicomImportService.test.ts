import { describe, it, expect } from "vitest";
import { EventBus } from "@core/EventBus";
import { Logger } from "@core/Logger";
import type { PlatformEvents } from "@core/PlatformEvents";
import { StudySeriesService } from "@services/StudySeriesService";
import { ImagingDatasetRegistry } from "@services/ImagingDatasetRegistry";
import { DicomImportService } from "@services/DicomImportService";

function buildServices() {
  const eventBus = new EventBus<PlatformEvents>();
  const logger = new Logger("test", "error");
  const studySeriesService = new StudySeriesService();
  const datasetRegistry = new ImagingDatasetRegistry(eventBus);
  const dicomImportService = new DicomImportService(studySeriesService, datasetRegistry, logger);
  return { studySeriesService, datasetRegistry, dicomImportService };
}

describe("StudySeriesService.getOrCreateStudy", () => {
  it("creates a study on first use with a caller-chosen id", () => {
    const service = new StudySeriesService();
    const study = service.getOrCreateStudy("dicom-studio-upload");
    expect(study.id).toBe("dicom-studio-upload");
    expect(service.getStudy("dicom-studio-upload")).toBe(study);
  });

  it("returns the same study on repeated calls rather than duplicating it", () => {
    const service = new StudySeriesService();
    const first = service.getOrCreateStudy("dicom-studio-upload");
    const second = service.getOrCreateStudy("dicom-studio-upload");
    expect(second).toBe(first);
  });
});

describe("DicomImportService (regression: study-not-found crash)", () => {
  // Reproduces the exact failure reported from the live DICOM Studio module:
  // "StudySeriesService: no study with id ..." — addSeries() requires a
  // pre-existing study, but the ad-hoc study ids DicomImportService uses
  // (e.g. "dicom-studio-upload") were never actually created first.
  it("importSyntheticPhantom does not throw for a fresh, never-before-seen study id", async () => {
    const { dicomImportService } = buildServices();
    await expect(dicomImportService.importSyntheticPhantom("dicom-studio-phantom")).resolves.toBeDefined();
  });

  it("repeated imports against the same study id both succeed (getOrCreate, not create-or-throw)", async () => {
    const { dicomImportService } = buildServices();
    await dicomImportService.importSyntheticPhantom("dicom-studio-upload");
    await expect(dicomImportService.importSyntheticPhantom("dicom-studio-upload")).resolves.toBeDefined();
  });

  it("registers the resulting dataset in ImagingDatasetRegistry", async () => {
    const { dicomImportService, datasetRegistry } = buildServices();
    const result = await dicomImportService.importSyntheticPhantom("dicom-studio-phantom");
    expect(datasetRegistry.get(result.imageStack.id)).toBeDefined();
  });
});
