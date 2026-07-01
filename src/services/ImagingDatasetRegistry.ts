/**
 * RTApps RadTherapyPlatform — Imaging Dataset Registry
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * This is the single most important Phase 1 service per the architecture
 * brief: "The same dataset must be loadable once and made available to"
 * Patient Library, OIS, CT Simulation, Dosimetry/TPS, Physics, Treatment
 * Delivery, Education, and Reporting.
 *
 * Modules never import/decode DICOM themselves — they ask the registry for
 * a dataset by id and, if it isn't loaded yet, ask DicomImportService to
 * load it *once* and register it here. Every other module then reads the
 * same in-memory dataset handle, so opening a CT in OIS and switching to
 * TPS does not re-import anything.
 */

import type { EventBus } from "@core/EventBus";
import type { PlatformEvents } from "@core/PlatformEvents";
import type { ImageStack, EntityId, Modality } from "@models/index";

/**
 * A registered dataset entry. `pixelData` is intentionally left as
 * `unknown` in Phase 1 — Phase 3 (Imaging Core Extraction) will define the
 * real Cornerstone3D/vtk.js-backed volume/stack representation here without
 * changing this registry's public API.
 */
export interface RegisteredDataset {
  datasetId: EntityId;
  imageStack: ImageStack;
  modality: Modality;
  pixelData?: unknown;
  registeredAt: string;
}

export class ImagingDatasetRegistry {
  private datasets = new Map<EntityId, RegisteredDataset>();

  constructor(private readonly eventBus: EventBus<PlatformEvents>) {}

  register(imageStack: ImageStack, modality: Modality, pixelData?: unknown): RegisteredDataset {
    const entry: RegisteredDataset = {
      datasetId: imageStack.id,
      imageStack,
      modality,
      pixelData,
      registeredAt: new Date().toISOString(),
    };
    this.datasets.set(entry.datasetId, entry);
    this.eventBus.emit("dataset:registered", {
      datasetId: entry.datasetId,
      studyId: imageStack.seriesId,
      modality,
    });
    return entry;
  }

  get(datasetId: EntityId): RegisteredDataset | undefined {
    return this.datasets.get(datasetId);
  }

  has(datasetId: EntityId): boolean {
    return this.datasets.has(datasetId);
  }

  list(): RegisteredDataset[] {
    return [...this.datasets.values()];
  }

  /** Notify the platform that a module opened an already-registered dataset. */
  open(datasetId: EntityId, moduleId: string): void {
    if (!this.datasets.has(datasetId)) {
      throw new Error(
        `ImagingDatasetRegistry: dataset "${datasetId}" is not registered. ` +
          `Import it via DicomImportService first.`,
      );
    }
    this.eventBus.emit("dataset:opened", { datasetId, moduleId });
  }

  unregister(datasetId: EntityId): void {
    this.datasets.delete(datasetId);
  }
}
