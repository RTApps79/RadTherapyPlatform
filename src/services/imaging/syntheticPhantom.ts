/**
 * RTApps RadTherapyPlatform — Synthetic Phantom Generator
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Procedurally generates a CT-like phantom volume (body ellipsoid, two
 * "bone" structures, spinal cord, a tumor) with realistic HU values — no
 * upload required, guaranteed to work for demos and offline use. Pattern
 * adapted from the reference DICOM alignment lab's `makeDemo()`.
 */

import type { Volume } from "./Volume";

export function generateSyntheticPhantom(cols = 160, rows = 160, depth = 96): Volume {
  const data = new Float32Array(cols * rows * depth);
  const cx = cols / 2;
  const cy = rows / 2;
  const cz = depth / 2;

  let dataMin = Infinity;
  let dataMax = -Infinity;

  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / 58;
        const dy = (y - cy) / 50;
        const dz = (z - cz) / 34;
        let v = -900; // air

        const body = dx * dx + dy * dy + dz * dz < 1;
        if (body) v = 35 + 18 * Math.sin(x * 0.08) + 12 * Math.cos(y * 0.06);

        const bone1 = ((x - cx + 22) / 10) ** 2 + ((y - cy) / 15) ** 2 + ((z - cz) / 28) ** 2 < 1;
        const bone2 = ((x - cx - 22) / 10) ** 2 + ((y - cy) / 15) ** 2 + ((z - cz) / 28) ** 2 < 1;
        if (bone1 || bone2) v = 850;

        const cord = ((x - cx) / 7) ** 2 + ((y - cy + 28) / 7) ** 2 + ((z - cz) / 44) ** 2 < 1;
        if (cord) v = 60;

        const tumor = ((x - cx - 18) / 13) ** 2 + ((y - cy + 18) / 10) ** 2 + ((z - cz - 5) / 9) ** 2 < 1;
        if (tumor) v = 115;

        const idx = z * rows * cols + y * cols + x;
        data[idx] = v;
        if (v < dataMin) dataMin = v;
        if (v > dataMax) dataMax = v;
      }
    }
  }

  return {
    cols,
    rows,
    depth,
    data,
    spacing: { x: 1, y: 1, z: 2.5 },
    dataMin,
    dataMax,
    meta: {
      patientName: "Synthetic QA Phantom",
      modality: "CT",
      seriesDescription: "Teaching anatomy phantom",
      sliceCount: depth,
      sourceFormat: "synthetic",
    },
  };
}
