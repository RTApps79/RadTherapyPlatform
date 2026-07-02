/**
 * RTApps — nifti-lite.js
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * A minimal, dependency-free NIfTI-1 (.nii.gz) reader for the browser.
 * Decompresses with the native DecompressionStream API (no pako/zlib
 * bundle needed), parses the 348-byte NIfTI-1 header, and extracts
 * axis-aligned slices (axial/sagittal/coronal) as normalized grayscale
 * image data ready to draw to a <canvas>.
 *
 * Scope/assumptions (fine for single-file NIfTI-1 volumes like these
 * teaching datasets; a real DicomImportService/NiftiImportService for
 * the platform proper would want to handle more datatypes and NIfTI-2):
 *   - Single-file NIfTI-1 only (magic 'n+1'), not the two-file .hdr/.img form.
 *   - Datatypes: uint8, int16, int32, float32, uint16 (covers MRI/CT/segmentation).
 *   - No qform/sform-based reorientation — slices are taken directly along
 *     the raw voxel axes (dim[1]/dim[2]/dim[3]) in storage order. Good
 *     enough for consistently-acquired teaching data; a clinical-grade
 *     reader would apply the affine to guarantee canonical orientation.
 *
 * Browser support: requires DecompressionStream (Chrome/Edge 80+, Safari
 * 16.4+, Firefox 113+). All current evergreen browsers.
 */

const NIFTI1_HEADER_SIZE = 348;

const DATATYPE_READERS = {
  2:   { name: 'uint8',   bytes: 1, ctor: Uint8Array },
  4:   { name: 'int16',   bytes: 2, ctor: Int16Array },
  8:   { name: 'int32',   bytes: 4, ctor: Int32Array },
  16:  { name: 'float32', bytes: 4, ctor: Float32Array },
  256: { name: 'int8',    bytes: 1, ctor: Int8Array },
  512: { name: 'uint16',  bytes: 2, ctor: Uint16Array },
  768: { name: 'uint32',  bytes: 4, ctor: Uint32Array },
};

/**
 * @typedef {Object} NiftiVolume
 * @property {number} nx
 * @property {number} ny
 * @property {number} nz
 * @property {number} pixdimX  in-plane voxel spacing (mm)
 * @property {number} pixdimY
 * @property {number} pixdimZ  through-plane spacing (mm)
 * @property {Float32Array} data  raw voxel data as float32, scl_slope/inter already applied
 * @property {number} dataMin
 * @property {number} dataMax
 */

/**
 * Fetch a .nii.gz URL and return the decompressed NIfTI-1 byte buffer.
 *
 * Servers commonly send `Content-Encoding: gzip` for .gz files (Vite's dev/
 * preview server and many static hosts do this). When that header is
 * present, the browser's fetch() implementation transparently decompresses
 * the body before handing it to us — so the bytes we receive are already
 * raw NIfTI, not gzip. If we blindly piped them through DecompressionStream
 * again, that second decompression would fail (or silently corrupt data)
 * because the bytes are no longer valid gzip. To handle both cases
 * correctly regardless of server configuration, we check the gzip magic
 * bytes (0x1F 0x8B) ourselves rather than trusting Content-Encoding was
 * left for us to handle.
 */
async function fetchAndDecompressGz(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`nifti-lite: failed to fetch "${url}" (${response.status})`);
  }
  const buf = await response.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzipStillCompressed = bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzipStillCompressed) {
    // Already decompressed by the browser (server sent Content-Encoding: gzip).
    return buf;
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'nifti-lite: this browser does not support DecompressionStream. ' +
        'Use a current version of Chrome, Edge, Firefox, or Safari.',
    );
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Response(buf).body.pipeThrough(ds);
  return new Response(stream).arrayBuffer();
}

/** Parse a NIfTI-1 header + voxel data from a decompressed ArrayBuffer. */
function parseNifti1(buffer) {
  const view = new DataView(buffer);

  const sizeofHdr = view.getInt32(0, true);
  if (sizeofHdr !== NIFTI1_HEADER_SIZE) {
    throw new Error(`nifti-lite: unexpected sizeof_hdr=${sizeofHdr}, not a valid NIfTI-1 file`);
  }

  const dim = [];
  for (let i = 0; i < 8; i++) dim.push(view.getInt16(40 + i * 2, true));

  const datatype = view.getInt16(70, true);
  const pixdim = [];
  for (let i = 0; i < 8; i++) pixdim.push(view.getFloat32(76 + i * 4, true));

  const voxOffset = view.getFloat32(108, true);
  const sclSlope = view.getFloat32(112, true);
  const sclInter = view.getFloat32(116, true);

  const magicBytes = new Uint8Array(buffer, 344, 3);
  const magic = String.fromCharCode(...magicBytes);
  if (magic !== 'n+1') {
    throw new Error(`nifti-lite: unsupported magic "${magic}" — only single-file NIfTI-1 ('n+1') is supported`);
  }

  const nx = dim[1], ny = dim[2], nz = dim[3] || 1;
  const reader = DATATYPE_READERS[datatype];
  if (!reader) {
    throw new Error(`nifti-lite: unsupported datatype code ${datatype}`);
  }

  const voxelCount = nx * ny * nz;
  const raw = new reader.ctor(buffer, voxOffset, voxelCount);

  // Apply scl_slope/scl_inter (defaults to identity if slope is 0, per NIfTI spec)
  const slope = sclSlope === 0 ? 1 : sclSlope;
  const data = new Float32Array(voxelCount);
  let dataMin = Infinity, dataMax = -Infinity;
  for (let i = 0; i < voxelCount; i++) {
    const v = raw[i] * slope + sclInter;
    data[i] = v;
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
  }

  return {
    nx, ny, nz,
    pixdimX: pixdim[1] || 1,
    pixdimY: pixdim[2] || 1,
    pixdimZ: pixdim[3] || 1,
    datatypeName: reader.name,
    data,
    dataMin,
    dataMax,
  };
}

/** Load a .nii.gz volume from a URL. */
export async function loadNiftiGz(url) {
  const buffer = await fetchAndDecompressGz(url);
  return parseNifti1(buffer);
}

/**
 * Extract a 2D slice along a given axis.
 * @param {NiftiVolume} volume
 * @param {'axial'|'sagittal'|'coronal'} axis
 * @param {number} index  slice index along that axis
 * @returns {{width:number, height:number, pixelSpacingX:number, pixelSpacingY:number, values:Float32Array}}
 */
export function getSlice(volume, axis, index) {
  const { nx, ny, nz, pixdimX, pixdimY, pixdimZ, data } = volume;
  // Voxel storage order is x fastest, then y, then z: idx = x + y*nx + z*nx*ny
  const at = (x, y, z) => data[x + y * nx + z * nx * ny];

  if (axis === 'axial') {
    // Fixed z, varying x (width) and y (height)
    const z = clampInt(index, 0, nz - 1);
    const width = nx, height = ny;
    const values = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        values[x + y * width] = at(x, y, z);
      }
    }
    return { width, height, pixelSpacingX: pixdimX, pixelSpacingY: pixdimY, values };
  }

  if (axis === 'sagittal') {
    // Fixed x, varying y (width) and z (height)
    const x = clampInt(index, 0, nx - 1);
    const width = ny, height = nz;
    const values = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let y = 0; y < width; y++) {
        values[y + z * width] = at(x, y, z);
      }
    }
    return { width, height, pixelSpacingX: pixdimY, pixelSpacingY: pixdimZ, values };
  }

  if (axis === 'coronal') {
    // Fixed y, varying x (width) and z (height)
    const y = clampInt(index, 0, ny - 1);
    const width = nx, height = nz;
    const values = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        values[x + z * width] = at(x, y, z);
      }
    }
    return { width, height, pixelSpacingX: pixdimX, pixelSpacingY: pixdimZ, values };
  }

  throw new Error(`nifti-lite: unknown axis "${axis}"`);
}

/** Number of slices available along a given axis. */
export function sliceCount(volume, axis) {
  if (axis === 'axial') return volume.nz;
  if (axis === 'sagittal') return volume.nx;
  if (axis === 'coronal') return volume.ny;
  throw new Error(`nifti-lite: unknown axis "${axis}"`);
}

/**
 * Render a slice onto a canvas as normalized grayscale, respecting physical
 * voxel spacing so anisotropic volumes (e.g. thick-slice MRI) don't look
 * squashed or stretched. The canvas is resized to a physically-proportional
 * pixel size scaled to fit `maxDim`.
 */
export function renderSliceToCanvas(slice, canvas, volume, maxDim = 512) {
  const { width, height, values, pixelSpacingX, pixelSpacingY } = slice;

  const physicalW = width * pixelSpacingX;
  const physicalH = height * pixelSpacingY;
  const scale = maxDim / Math.max(physicalW, physicalH);
  const outW = Math.max(1, Math.round(physicalW * scale));
  const outH = Math.max(1, Math.round(physicalH * scale));

  // Draw at native voxel resolution first, then scale with the canvas API
  // (nearest-neighbor at native res, then browser-smoothed on upscale).
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  const imgData = octx.createImageData(width, height);

  const { dataMin, dataMax } = volume;
  const range = dataMax - dataMin || 1;
  for (let i = 0; i < values.length; i++) {
    const norm = clampInt(Math.round(((values[i] - dataMin) / range) * 255), 0, 255);
    imgData.data[i * 4 + 0] = norm;
    imgData.data[i * 4 + 1] = norm;
    imgData.data[i * 4 + 2] = norm;
    imgData.data[i * 4 + 3] = 255;
  }
  octx.putImageData(imgData, 0, 0);

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(off, 0, 0, outW, outH);
}

function clampInt(v, lo, hi) {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}
