/**
 * RTApps RadTherapyPlatform — Imaging Volume Type
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * A single, format-agnostic 3D volume representation that both the DICOM
 * series loader and the NIfTI loader produce, and that the MPR renderer
 * consumes. This is what lets one viewer (DicomStudioModule) and one
 * rendering pipeline serve both real DICOM series and NIfTI research
 * volumes without format-specific branching anywhere above the loaders.
 *
 * Voxel storage order matches nifti-lite.js and the DICOM alignment lab
 * reference: x fastest, then y, then z —
 *   data[z * rows * cols + y * cols + x]
 */

export interface VolumeSpacing {
  x: number;
  y: number;
  z: number;
}

export interface VolumeMeta {
  patientName?: string;
  modality?: string;
  seriesDescription?: string;
  sliceCount: number;
  skippedFiles?: number;
  sourceFormat: "dicom" | "nifti" | "synthetic";
}

export interface Volume {
  cols: number;
  rows: number;
  depth: number;
  /** HU for CT, arbitrary intensity for MR/NIfTI — always float32 internally after any scaling is applied. */
  data: Float32Array;
  spacing: VolumeSpacing;
  meta: VolumeMeta;
  /** Data range, used for default window/level when no CT-style preset applies. */
  dataMin: number;
  dataMax: number;
}

/** Nearest-neighbor voxel lookup. Out-of-bounds reads return `outOfBounds` (default: volume min). */
export function sampleVolume(v: Volume, x: number, y: number, z: number, outOfBounds?: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const zi = Math.round(z);
  if (xi < 0 || yi < 0 || zi < 0 || xi >= v.cols || yi >= v.rows || zi >= v.depth) {
    return outOfBounds ?? v.dataMin;
  }
  return v.data[zi * v.rows * v.cols + yi * v.cols + xi]!;
}
