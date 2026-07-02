/**
 * RTApps RadTherapyPlatform — NIfTI Volume Loader
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * TypeScript port of the gzip-decompress + NIfTI-1 header parsing logic
 * from `public/legacy/ct-simulation/nifti-lite.js` (built and verified
 * against real brain MRI data in that module), restructured to output the
 * shared `Volume` type so the same MPR renderer serves both DICOM and
 * NIfTI sources. See that file's header comment for the documented
 * scope/assumptions (single-file NIfTI-1 only, common datatypes, no
 * qform/sform reorientation).
 */

import type { Volume } from "./Volume";

const NIFTI1_HEADER_SIZE = 348;

const DATATYPE_READERS: Record<number, { name: string; ctor: new (buf: ArrayBufferLike, offset: number, length: number) => ArrayLike<number> }> = {
  2: { name: "uint8", ctor: Uint8Array },
  4: { name: "int16", ctor: Int16Array },
  8: { name: "int32", ctor: Int32Array },
  16: { name: "float32", ctor: Float32Array },
  256: { name: "int8", ctor: Int8Array },
  512: { name: "uint16", ctor: Uint16Array },
  768: { name: "uint32", ctor: Uint32Array },
};

async function fetchAndDecompressGz(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`niftiVolumeLoader: failed to fetch "${url}" (${response.status})`);
  }
  const buf = await response.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzipStillCompressed = bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzipStillCompressed) {
    return buf; // server already decompressed it (Content-Encoding: gzip)
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("niftiVolumeLoader: this browser does not support DecompressionStream.");
  }
  const ds = new DecompressionStream("gzip");
  const stream = new Response(buf).body!.pipeThrough(ds);
  return new Response(stream).arrayBuffer();
}

export async function loadNiftiVolume(url: string, label?: string): Promise<Volume> {
  const buffer = await fetchAndDecompressGz(url);
  const view = new DataView(buffer);

  const sizeofHdr = view.getInt32(0, true);
  if (sizeofHdr !== NIFTI1_HEADER_SIZE) {
    throw new Error(`niftiVolumeLoader: unexpected sizeof_hdr=${sizeofHdr}, not a valid NIfTI-1 file`);
  }

  const dim: number[] = [];
  for (let i = 0; i < 8; i++) dim.push(view.getInt16(40 + i * 2, true));

  const datatype = view.getInt16(70, true);
  const pixdim: number[] = [];
  for (let i = 0; i < 8; i++) pixdim.push(view.getFloat32(76 + i * 4, true));

  const voxOffset = view.getFloat32(108, true);
  const sclSlope = view.getFloat32(112, true);
  const sclInter = view.getFloat32(116, true);

  const magicBytes = new Uint8Array(buffer, 344, 3);
  const magic = String.fromCharCode(...magicBytes);
  if (magic !== "n+1") {
    throw new Error(`niftiVolumeLoader: unsupported magic "${magic}" — only single-file NIfTI-1 ('n+1') is supported`);
  }

  const cols = dim[1]!;
  const rows = dim[2]!;
  const depth = dim[3] || 1;
  const reader = DATATYPE_READERS[datatype];
  if (!reader) {
    throw new Error(`niftiVolumeLoader: unsupported datatype code ${datatype}`);
  }

  const voxelCount = cols * rows * depth;
  const raw = new reader.ctor(buffer, voxOffset, voxelCount);

  const slope = sclSlope === 0 ? 1 : sclSlope;
  const data = new Float32Array(voxelCount);
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (let i = 0; i < voxelCount; i++) {
    const v = raw[i]! * slope + sclInter;
    data[i] = v;
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
  }

  return {
    cols,
    rows,
    depth,
    data,
    spacing: { x: pixdim[1] || 1, y: pixdim[2] || 1, z: pixdim[3] || 1 },
    dataMin,
    dataMax,
    meta: {
      seriesDescription: label,
      modality: "MR",
      sliceCount: depth,
      sourceFormat: "nifti",
    },
  };
}
