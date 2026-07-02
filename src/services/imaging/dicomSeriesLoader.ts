/**
 * RTApps RadTherapyPlatform — DICOM Series Loader
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Parses a set of uploaded DICOM files (a CT/MR series) into a single
 * Volume, using the real `dicom-parser` library (Cornerstone.js ecosystem
 * — the library the platform's original architecture brief specifically
 * named). The approach — per-file HU calibration via Rescale Slope/
 * Intercept, sorting by ImagePositionPatient Z (falling back to Instance
 * Number), skipping compressed transfer syntaxes we can't decode pixel
 * data for — is adapted from a working reference implementation
 * (RadTherapyApps DICOM MPR Alignment Lab) rather than designed from
 * scratch.
 */

import * as dicomParser from "dicom-parser";
import type { Volume } from "./Volume";

export interface DicomLoadResult {
  volume: Volume;
  skippedFiles: number;
  skipped: SkippedFile[];
  warnings: string[];
}

interface ParsedSlice {
  hu: Float32Array;
  z: number;
  instanceNumber: number;
  rows: number;
  cols: number;
}

function multiFloat(ds: dicomParser.DataSet, tag: string): number[] {
  const raw = ds.string(tag);
  if (!raw) return [];
  return raw.split("\\").map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));
}

export type SkipReason =
  | "not-dicom"
  | "compressed-transfer-syntax"
  | "no-pixel-data"
  | "unsupported-bit-depth"
  | "inconsistent-matrix-size";

export interface SkippedFile {
  filename: string;
  reason: SkipReason;
  detail?: string;
}

type ParseOutcome = { ok: true; slice: ParsedSlice; ds: dicomParser.DataSet } | { ok: false; reason: SkipReason; detail?: string };

/** Parse a single DICOM file into calibrated HU pixel data + spatial metadata, reporting *why* on failure rather than just failing silently. */
async function parseSliceFile(file: File): Promise<ParseOutcome> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let ds: dicomParser.DataSet;
  try {
    ds = dicomParser.parseDicom(bytes);
  } catch (err) {
    return { ok: false, reason: "not-dicom", detail: (err as Error).message };
  }

  const transferSyntax = ds.string("x00020010") ?? "";
  if (transferSyntax.startsWith("1.2.840.10008.1.2.4")) {
    // JPEG-family compressed transfer syntaxes — pixel data isn't directly
    // readable without a JPEG decoder we don't ship. Skip rather than
    // silently decode garbage.
    return { ok: false, reason: "compressed-transfer-syntax", detail: transferSyntax };
  }

  const rows = ds.uint16("x00280010");
  const cols = ds.uint16("x00280011");
  const pixelDataElement = ds.elements.x7fe00010;
  if (!rows || !cols || !pixelDataElement) {
    // Common and *expected* for non-image DICOM objects mixed into a real
    // download folder: DICOMDIR index files, Structured Report (SR)
    // objects, dose reports, presentation states. Not a bug — these
    // legitimately carry no image pixel data.
    return { ok: false, reason: "no-pixel-data", detail: ds.string("x00080060") /* Modality, if present */ };
  }

  const bitsAllocated = ds.uint16("x00280100") ?? 16;
  const pixelRepresentation = ds.uint16("x00280103") ?? 0; // 0 = unsigned, 1 = signed
  if (bitsAllocated !== 16 && bitsAllocated !== 8) {
    return { ok: false, reason: "unsupported-bit-depth", detail: `${bitsAllocated}-bit` };
  }

  const slope = ds.floatString("x00281053") ?? 1;
  const intercept = ds.floatString("x00281052") ?? 0;
  const instanceNumber = ds.intString("x00200013") ?? 0;
  const ipp = multiFloat(ds, "x00200032");

  const count = rows * cols;
  const byteOffset = ds.byteArray.byteOffset + pixelDataElement.dataOffset;
  const buf = ds.byteArray.buffer;

  let raw: Uint16Array | Int16Array | Uint8Array;
  if (bitsAllocated === 16) {
    raw = pixelRepresentation ? new Int16Array(buf, byteOffset, count) : new Uint16Array(buf, byteOffset, count);
  } else {
    raw = new Uint8Array(buf, byteOffset, count);
  }

  const hu = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    hu[i] = raw[i]! * slope + intercept;
  }

  const z = ipp.length === 3 && Number.isFinite(ipp[2]) ? ipp[2]! : instanceNumber;

  return { ok: true, slice: { hu, z, instanceNumber, rows, cols }, ds };
}

/**
 * Load a series of DICOM files (from a folder/multi-file picker) into a
 * single Volume. Files that aren't valid, usable DICOM (DICOMDIR/SR/dose
 * report objects with no pixel data, compressed pixel data, non-16/8-bit)
 * are skipped and reported *with a reason* rather than the whole load
 * aborting or the reason being lost.
 */
export async function loadDicomSeries(files: File[] | FileList): Promise<DicomLoadResult> {
  const fileArray = Array.from(files);
  const warnings: string[] = [];
  const parsed: Array<{ slice: ParsedSlice; ds: dicomParser.DataSet }> = [];
  const skipped: SkippedFile[] = [];

  for (const file of fileArray) {
    const result = await parseSliceFile(file);
    if (!result.ok) {
      skipped.push({ filename: file.name, reason: result.reason, detail: result.detail });
      continue;
    }
    parsed.push(result);
  }

  if (parsed.length === 0) {
    throw new Error(
      `loadDicomSeries: no usable DICOM slices found among ${fileArray.length} file(s). ` +
        summarizeSkipReasons(skipped),
    );
  }

  // Sanity check: all slices must share the same in-plane matrix size.
  const { rows, cols } = parsed[0]!.slice;
  const consistent = parsed.filter((p) => p.slice.rows === rows && p.slice.cols === cols);
  if (consistent.length < parsed.length) {
    const dropped = parsed.length - consistent.length;
    warnings.push(`${dropped} slice(s) had a different matrix size than the first slice and were dropped.`);
    for (const p of parsed) {
      if (p.slice.rows !== rows || p.slice.cols !== cols) {
        skipped.push({ filename: "(matrix mismatch)", reason: "inconsistent-matrix-size", detail: `${p.slice.cols}x${p.slice.rows}` });
      }
    }
  }

  consistent.sort((a, b) => a.slice.z - b.slice.z);

  const depth = consistent.length;
  const data = new Float32Array(cols * rows * depth);
  for (let z = 0; z < depth; z++) {
    data.set(consistent[z]!.slice.hu, z * rows * cols);
  }

  const first = consistent[0]!.ds;
  const pixelSpacing = multiFloat(first, "x00280030");
  const spacingX = pixelSpacing[1] ?? 1; // PixelSpacing is [row spacing, col spacing] = [y, x]
  const spacingY = pixelSpacing[0] ?? 1;

  let spacingZ = first.floatString("x00180050") ?? 1; // SliceThickness fallback
  if (depth > 1) {
    const zSpan = Math.abs(consistent[depth - 1]!.slice.z - consistent[0]!.slice.z);
    if (zSpan > 0) spacingZ = zSpan / (depth - 1);
  }

  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
  }

  const volume: Volume = {
    cols,
    rows,
    depth,
    data,
    spacing: { x: spacingX, y: spacingY, z: spacingZ },
    dataMin,
    dataMax,
    meta: {
      patientName: first.string("x00100010"),
      modality: first.string("x00080060"),
      seriesDescription: first.string("x0008103e"),
      sliceCount: depth,
      skippedFiles: skipped.length,
      sourceFormat: "dicom",
    },
  };

  return { volume, skippedFiles: skipped.length, skipped, warnings };
}

function summarizeSkipReasons(skipped: SkippedFile[]): string {
  if (skipped.length === 0) return "";
  const counts = new Map<SkipReason, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const parts = [...counts.entries()].map(([reason, count]) => `${count} ${reason}`);
  return `Skipped: ${parts.join(", ")}.`;
}
