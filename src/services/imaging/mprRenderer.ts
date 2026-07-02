/**
 * RTApps RadTherapyPlatform — MPR Renderer
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Multiplanar reconstruction rendering, adapted from the reference
 * RadTherapyApps DICOM MPR Alignment Lab. Renders axial/sagittal/coronal
 * slices by iterating destination *screen* pixels and inverse-mapping
 * each one back to a volume-space coordinate (rather than extracting a
 * slice array and scaling it afterward) — this is resolution-independent
 * and is the same technique the reference implementation uses for its
 * rotating MIP view.
 *
 * Also implements "fusion" overlay of a second volume against the first
 * (blend / checkerboard / split), for image registration/comparison
 * teaching — the general-purpose version of this; the specific "hidden
 * ground-truth misalignment" IGRT exercise lives in the Treatment
 * Delivery module, built on top of this same renderer.
 */

import { sampleVolume, type Volume } from "./Volume";

export type MprPlane = "axial" | "sagittal" | "coronal";
export type FusionMode = "none" | "blend" | "checker" | "split";

export interface WindowLevel {
  width: number;
  level: number;
}

/** Common CT window/level presets (HU). For MR/NIfTI data, use `deriveDefaultWindowLevel` instead. */
export const CT_WINDOW_PRESETS: Record<string, WindowLevel> = {
  soft: { width: 400, level: 40 },
  bone: { width: 1800, level: 400 },
  lung: { width: 1500, level: -600 },
  brain: { width: 80, level: 40 },
};

/** For non-CT data without meaningful HU, derive a sensible window/level from the volume's actual data range. */
export function deriveDefaultWindowLevel(volume: Volume): WindowLevel {
  const width = Math.max(1, volume.dataMax - volume.dataMin);
  const level = volume.dataMin + width / 2;
  return { width, level };
}

export function windowLevelToGray(value: number, wl: WindowLevel): number {
  const g = Math.round(((value - (wl.level - wl.width / 2)) * 255) / wl.width);
  return g < 0 ? 0 : g > 255 ? 255 : g;
}

interface PlaneGeometry {
  scale: number;
  offsetX: number;
  offsetY: number;
  sliceWidth: number;
  sliceHeight: number;
}

function planeDimensions(volume: Volume, plane: MprPlane): { width: number; height: number } {
  if (plane === "axial") return { width: volume.cols, height: volume.rows };
  if (plane === "coronal") return { width: volume.cols, height: volume.depth };
  return { width: volume.rows, height: volume.depth }; // sagittal
}

/** Map 2D in-plane coordinates (i, j) to 3D volume coordinates for the given plane and fixed cursor position. */
export function mapToVolumeCoords(
  plane: MprPlane,
  i: number,
  j: number,
  cursor: { x: number; y: number; z: number },
  volume: Volume,
): [number, number, number] {
  if (plane === "axial") return [i, j, cursor.z];
  if (plane === "coronal") return [i, cursor.y, volume.depth - 1 - j];
  return [cursor.x, i, volume.depth - 1 - j]; // sagittal
}

export interface RenderMprOptions {
  volume: Volume;
  plane: MprPlane;
  /** Cursor position in voxel-index space; only the two in-plane-irrelevant axes matter for slicing. */
  cursor: { x: number; y: number; z: number };
  windowLevel: WindowLevel;
  canvas: HTMLCanvasElement;
  /** Optional second volume to fuse against the first. */
  fusion?: {
    volume: Volume;
    mode: FusionMode;
    alpha: number; // 0..1
    windowLevel: WindowLevel;
    /** Voxel-space offset applied when sampling the fusion volume (e.g. simulated misregistration). */
    offset?: { x: number; y: number; z: number };
  };
  /** Draw crosshair lines at the cursor position. */
  showCrosshair?: boolean;
}

/** Render one MPR plane into the given canvas, with optional fusion overlay. Returns the geometry used (for crosshair/click-to-navigate math). */
export function renderMprSlice(options: RenderMprOptions): PlaneGeometry {
  const { volume, plane, cursor, windowLevel, canvas, fusion, showCrosshair } = options;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;

  const { width: sliceWidth, height: sliceHeight } = planeDimensions(volume, plane);
  const scale = Math.min(w / sliceWidth, h / sliceHeight);
  const offsetX = (w - sliceWidth * scale) / 2;
  const offsetY = (h - sliceHeight * scale) / 2;

  const imageData = ctx.createImageData(w, h);
  const fusionEnabled = !!fusion && fusion.mode !== "none";

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const ix = (px - offsetX) / scale;
      const iy = (py - offsetY) / scale;
      let r = 0;
      let g = 0;
      let b = 0;

      if (ix >= 0 && iy >= 0 && ix < sliceWidth && iy < sliceHeight) {
        const [vx, vy, vz] = mapToVolumeCoords(plane, ix, iy, cursor, volume);
        const base = windowLevelToGray(sampleVolume(volume, vx, vy, vz), windowLevel);
        r = g = b = base;

        if (fusionEnabled && fusion) {
          const off = fusion.offset ?? { x: 0, y: 0, z: 0 };
          const fVal = windowLevelToGray(
            sampleVolume(fusion.volume, vx + off.x, vy + off.y, vz + off.z),
            fusion.windowLevel,
          );

          const checkerTile = (Math.floor(ix / 24) + Math.floor(iy / 24)) % 2 === 0;
          const splitLeft = ix < sliceWidth / 2;
          const useOverlay =
            fusion.mode === "blend" || (fusion.mode === "checker" && checkerTile) || (fusion.mode === "split" && !splitLeft);

          if (useOverlay) {
            const a = fusion.alpha;
            r = Math.round(base * (1 - a) + fVal * a);
            g = Math.round(base * (1 - a) + fVal * a * 0.75 + 20 * a);
            b = Math.round(base * (1 - a) + fVal * a * 0.15);
          }
        }
      }

      const k = (py * w + px) * 4;
      imageData.data[k] = r;
      imageData.data[k + 1] = g;
      imageData.data[k + 2] = b;
      imageData.data[k + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const geometry: PlaneGeometry = { scale, offsetX, offsetY, sliceWidth, sliceHeight };

  if (showCrosshair) {
    drawCrosshair(ctx, w, h, plane, cursor, geometry, volume);
  }

  return geometry;
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plane: MprPlane,
  cursor: { x: number; y: number; z: number },
  geom: PlaneGeometry,
  volume: Volume,
): void {
  let cx: number;
  let cy: number;
  if (plane === "axial") {
    cx = geom.offsetX + cursor.x * geom.scale;
    cy = geom.offsetY + cursor.y * geom.scale;
  } else if (plane === "coronal") {
    cx = geom.offsetX + cursor.x * geom.scale;
    cy = geom.offsetY + (volume.depth - 1 - cursor.z) * geom.scale;
  } else {
    cx = geom.offsetX + cursor.y * geom.scale;
    cy = geom.offsetY + (volume.depth - 1 - cursor.z) * geom.scale;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.75)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  ctx.restore();
}

/**
 * Convert a click/drag point (canvas pixel coords) on a rendered plane
 * back into the two in-plane voxel-index axes it corresponds to. Used for
 * click-to-navigate and crosshair dragging.
 */
export function canvasPointToVoxel(
  plane: MprPlane,
  canvasX: number,
  canvasY: number,
  geom: PlaneGeometry,
  volume: Volume,
): { x?: number; y?: number; z?: number } {
  const ix = (canvasX - geom.offsetX) / geom.scale;
  const iy = (canvasY - geom.offsetY) / geom.scale;
  if (plane === "axial") return { x: ix, y: iy };
  if (plane === "coronal") return { x: ix, z: volume.depth - 1 - iy };
  return { y: ix, z: volume.depth - 1 - iy }; // sagittal
}
