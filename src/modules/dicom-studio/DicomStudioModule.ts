/**
 * RTApps RadTherapyPlatform — DICOM Studio Module
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * The platform's general-purpose multi-format imaging viewer: real DICOM
 * series (via dicom-parser) or NIfTI volumes, rendered as synced
 * axial/sagittal/coronal MPR with window/level, plus a second-dataset
 * fusion overlay (blend/checkerboard/split) for image comparison. Built
 * on the shared `ImagingDatasetRegistry`/`DicomImportService` — loading a
 * dataset here registers it in the same registry every other module
 * reads from, per the platform's core "one shared dataset" principle.
 *
 * Rendering technique adapted from the reference RadTherapyApps DICOM MPR
 * Alignment Lab (backward-mapped per-pixel slicing — see mprRenderer.ts).
 * The specific "hidden ground-truth misalignment" IGRT teaching exercise
 * from that reference lives in the Treatment Delivery module instead,
 * built on this same renderer.
 */

import type { ModuleDefinition, ModuleContext } from "@core/types";
import { branding } from "@config/branding";
import { DicomImportServiceToken } from "@services/tokens";
import {
  renderMprSlice,
  canvasPointToVoxel,
  deriveDefaultWindowLevel,
  CT_WINDOW_PRESETS,
  type MprPlane,
  type FusionMode,
  type WindowLevel,
} from "@services/imaging/mprRenderer";
import { sampleVolume, type Volume } from "@services/imaging/Volume";

const NIFTI_LIBRARY: Array<{ id: string; label: string; url: string }> = [
  { id: "brain-001-flair", label: "Brain Mets 001 — FLAIR", url: "data/imaging/brain-mri/brain-mets-prototype-001/flair.nii.gz" },
  { id: "brain-001-t1ce", label: "Brain Mets 001 — T1CE", url: "data/imaging/brain-mri/brain-mets-prototype-001/t1ce.nii.gz" },
  { id: "brain-002-flair", label: "Brain Mets 002 — FLAIR", url: "data/imaging/brain-mri/brain-mets-prototype-002/flair.nii.gz" },
  { id: "brain-002-t1ce", label: "Brain Mets 002 — T1CE", url: "data/imaging/brain-mri/brain-mets-prototype-002/t1ce.nii.gz" },
  { id: "brain-003-flair", label: "Brain Mets 003 — FLAIR", url: "data/imaging/brain-mri/brain-mets-prototype-003/flair.nii.gz" },
  { id: "brain-003-t1ce", label: "Brain Mets 003 — T1CE", url: "data/imaging/brain-mri/brain-mets-prototype-003/t1ce.nii.gz" },
];

const PLANES: MprPlane[] = ["axial", "coronal", "sagittal"];

export const DicomStudioModule: ModuleDefinition = {
  id: "dicom-studio",
  title: "DICOM Studio",
  description: "Multi-format DICOM/NIfTI viewer: MPR, window/level, and fusion overlay for image comparison.",
  order: 4,
  status: "active",
  mount(context: ModuleContext) {
    const { container, services, logger } = context;
    const dicomImport = services.resolve(DicomImportServiceToken);

    let primary: Volume | null = null;
    let fusionVolume: Volume | null = null;
    let fusionMode: FusionMode = "none";
    let fusionAlpha = 0.5;
    let windowLevel: WindowLevel = CT_WINDOW_PRESETS.soft!;
    let fusionWindowLevel: WindowLevel = CT_WINDOW_PRESETS.soft!;
    let cursor = { x: 0, y: 0, z: 0 };
    let loadToken = 0;

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 300px 1fr; gap: 16px; height: 100%; min-height: 0;">
        <div class="rtapps-panel" style="overflow-y: auto; padding: 14px;">
          <span class="rtapps-badge rtapps-badge--accent">DICOM Studio</span>
          <div id="ds-status" style="font-size: 12px; color: var(--rtapps-text-muted); margin: 8px 0 14px;">No dataset loaded.</div>

          <div class="sidebar-title" style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Load Dataset</div>
          <input id="ds-dicom-input" type="file" multiple webkitdirectory style="display:none" />
          <button id="ds-load-dicom" style="width: 100%; margin-bottom: 6px;" class="rtapps-nav__item">Upload DICOM Folder</button>
          <select id="ds-nifti-select" style="width: 100%; margin-bottom: 6px; padding: 6px; border-radius: var(--rtapps-radius-sm); border: 1px solid var(--rtapps-panel-border); background: var(--rtapps-bg-elevated); color: var(--rtapps-text-secondary); font-size: 12px;">
            <option value="">Brain MRI library…</option>
            ${NIFTI_LIBRARY.map((n) => `<option value="${n.id}">${n.label}</option>`).join("")}
          </select>
          <button id="ds-load-phantom" style="width: 100%; margin-bottom: 14px;" class="rtapps-nav__item">Synthetic Phantom</button>

          <div class="sidebar-title" style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Window / Level</div>
          <select id="ds-wl-preset" style="width: 100%; margin-bottom: 6px; padding: 6px; border-radius: var(--rtapps-radius-sm); border: 1px solid var(--rtapps-panel-border); background: var(--rtapps-bg-elevated); color: var(--rtapps-text-secondary); font-size: 12px;">
            <option value="soft">Soft tissue</option>
            <option value="bone">Bone</option>
            <option value="lung">Lung</option>
            <option value="brain">Brain</option>
            <option value="auto">Auto (data range)</option>
          </select>
          <div style="font-size: 11px; color: var(--rtapps-text-muted); display: flex; justify-content: space-between;">
            <span>Width</span><span id="ds-wl-width-val">400</span>
          </div>
          <input id="ds-wl-width" type="range" min="1" max="4000" value="400" style="width: 100%; margin-bottom: 6px;" />
          <div style="font-size: 11px; color: var(--rtapps-text-muted); display: flex; justify-content: space-between;">
            <span>Level</span><span id="ds-wl-level-val">40</span>
          </div>
          <input id="ds-wl-level" type="range" min="-1500" max="1500" value="40" style="width: 100%; margin-bottom: 14px;" />

          <div class="sidebar-title" style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Fusion (2nd dataset)</div>
          <select id="ds-fusion-nifti-select" style="width: 100%; margin-bottom: 6px; padding: 6px; border-radius: var(--rtapps-radius-sm); border: 1px solid var(--rtapps-panel-border); background: var(--rtapps-bg-elevated); color: var(--rtapps-text-secondary); font-size: 12px;">
            <option value="">Load fusion dataset…</option>
            ${NIFTI_LIBRARY.map((n) => `<option value="${n.id}">${n.label}</option>`).join("")}
          </select>
          <div class="mri-plane-group" id="ds-fusion-mode" style="margin-bottom: 6px;">
            <button data-mode="none" class="active">None</button>
            <button data-mode="blend">Blend</button>
            <button data-mode="checker">Checker</button>
            <button data-mode="split">Split</button>
          </div>
          <div style="font-size: 11px; color: var(--rtapps-text-muted); display: flex; justify-content: space-between;">
            <span>Fusion opacity</span><span id="ds-alpha-val">50%</span>
          </div>
          <input id="ds-alpha" type="range" min="0" max="100" value="50" style="width: 100%;" />

          <p style="font-size: 11px; color: var(--rtapps-text-muted); margin-top: 16px;">
            ${branding.nonClinicalDisclaimer}
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; min-height: 0;">
          ${PLANES.map(
            (plane) => `
            <div class="rtapps-panel" style="padding: 8px; display: flex; flex-direction: column; min-height: 0;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--rtapps-text-muted); margin-bottom: 4px;">
                <span style="text-transform: capitalize;">${plane}</span>
                <span id="ds-readout-${plane}">—</span>
              </div>
              <div style="flex: 1; min-height: 0; background: #000; border-radius: var(--rtapps-radius-sm); overflow: hidden;">
                <canvas id="ds-canvas-${plane}" width="512" height="512" style="width: 100%; height: 100%; display: block; cursor: crosshair;"></canvas>
              </div>
            </div>`,
          ).join("")}
          <div class="rtapps-panel" style="padding: 12px; overflow-y: auto;">
            <h3 style="margin-top: 0;">Dataset Info</h3>
            <div id="ds-info" style="font-size: 12px; color: var(--rtapps-text-secondary);">No dataset loaded.</div>
          </div>
        </div>
      </div>
    `;

    const statusEl = container.querySelector<HTMLDivElement>("#ds-status")!;
    const infoEl = container.querySelector<HTMLDivElement>("#ds-info")!;
    const dicomInput = container.querySelector<HTMLInputElement>("#ds-dicom-input")!;
    const loadDicomBtn = container.querySelector<HTMLButtonElement>("#ds-load-dicom")!;
    const niftiSelect = container.querySelector<HTMLSelectElement>("#ds-nifti-select")!;
    const phantomBtn = container.querySelector<HTMLButtonElement>("#ds-load-phantom")!;
    const wlPreset = container.querySelector<HTMLSelectElement>("#ds-wl-preset")!;
    const wlWidth = container.querySelector<HTMLInputElement>("#ds-wl-width")!;
    const wlLevel = container.querySelector<HTMLInputElement>("#ds-wl-level")!;
    const fusionNiftiSelect = container.querySelector<HTMLSelectElement>("#ds-fusion-nifti-select")!;
    const fusionModeGroup = container.querySelector<HTMLDivElement>("#ds-fusion-mode")!;
    const alphaInput = container.querySelector<HTMLInputElement>("#ds-alpha")!;

    const canvases: Record<MprPlane, HTMLCanvasElement> = {
      axial: container.querySelector<HTMLCanvasElement>("#ds-canvas-axial")!,
      coronal: container.querySelector<HTMLCanvasElement>("#ds-canvas-coronal")!,
      sagittal: container.querySelector<HTMLCanvasElement>("#ds-canvas-sagittal")!,
    };
    const readouts: Record<MprPlane, HTMLSpanElement> = {
      axial: container.querySelector<HTMLSpanElement>("#ds-readout-axial")!,
      coronal: container.querySelector<HTMLSpanElement>("#ds-readout-coronal")!,
      sagittal: container.querySelector<HTMLSpanElement>("#ds-readout-sagittal")!,
    };

    function clampCursor() {
      if (!primary) return;
      cursor.x = Math.max(0, Math.min(cursor.x, primary.cols - 1));
      cursor.y = Math.max(0, Math.min(cursor.y, primary.rows - 1));
      cursor.z = Math.max(0, Math.min(cursor.z, primary.depth - 1));
    }

    function render() {
      if (!primary) return;
      clampCursor();
      for (const plane of PLANES) {
        const geom = renderMprSlice({
          volume: primary,
          plane,
          cursor,
          windowLevel,
          canvas: canvases[plane],
          showCrosshair: true,
          fusion:
            fusionVolume && fusionMode !== "none"
              ? { volume: fusionVolume, mode: fusionMode, alpha: fusionAlpha, windowLevel: fusionWindowLevel }
              : undefined,
        });
        canvases[plane].dataset.geom = JSON.stringify(geom);
      }
      readouts.axial.textContent = `Z ${cursor.z + 1}/${primary.depth}`;
      readouts.coronal.textContent = `Y ${cursor.y + 1}/${primary.rows}`;
      readouts.sagittal.textContent = `X ${cursor.x + 1}/${primary.cols}`;
    }

    function updateInfo() {
      if (!primary) {
        infoEl.textContent = "No dataset loaded.";
        return;
      }
      const m = primary.meta;
      infoEl.innerHTML = `
        <div>Patient: ${m.patientName ?? "—"}</div>
        <div>Modality: ${m.modality ?? "—"}</div>
        <div>Series: ${m.seriesDescription ?? "—"}</div>
        <div>Matrix: ${primary.cols} × ${primary.rows} × ${primary.depth}</div>
        <div>Spacing: ${primary.spacing.x.toFixed(2)} / ${primary.spacing.y.toFixed(2)} / ${primary.spacing.z.toFixed(2)} mm</div>
        <div>Data range: ${primary.dataMin.toFixed(0)} to ${primary.dataMax.toFixed(0)}</div>
        <div>Source: ${m.sourceFormat}${m.skippedFiles ? ` (${m.skippedFiles} file(s) skipped)` : ""}</div>
      `;
    }

    function setPrimaryVolume(volume: Volume, sourceLabel: string) {
      primary = volume;
      cursor = { x: Math.floor(volume.cols / 2), y: Math.floor(volume.rows / 2), z: Math.floor(volume.depth / 2) };
      windowLevel = volume.meta.sourceFormat === "dicom" ? CT_WINDOW_PRESETS.soft! : deriveDefaultWindowLevel(volume);
      wlWidth.value = String(Math.round(windowLevel.width));
      wlLevel.value = String(Math.round(windowLevel.level));
      container.querySelector<HTMLSpanElement>("#ds-wl-width-val")!.textContent = wlWidth.value;
      container.querySelector<HTMLSpanElement>("#ds-wl-level-val")!.textContent = wlLevel.value;
      statusEl.textContent = `Loaded: ${sourceLabel}`;
      updateInfo();
      render();
    }

    // --- Dataset loading ---
    loadDicomBtn.addEventListener("click", () => dicomInput.click());
    dicomInput.addEventListener("change", async () => {
      const files = dicomInput.files;
      if (!files || files.length === 0) return;
      const myToken = ++loadToken;
      statusEl.textContent = `Loading ${files.length} DICOM file(s)…`;
      try {
        const result = await dicomImport.importDicomSeries(files, "dicom-studio-upload");
        if (myToken !== loadToken) return;
        setPrimaryVolume(result.volume, `DICOM series (${result.volume.depth} slices)`);
      } catch (err) {
        if (myToken !== loadToken) return;
        statusEl.textContent = `Failed to load DICOM: ${(err as Error).message}`;
        logger.error("DICOM load failed", err);
      }
    });

    niftiSelect.addEventListener("change", async () => {
      const entry = NIFTI_LIBRARY.find((n) => n.id === niftiSelect.value);
      if (!entry) return;
      const myToken = ++loadToken;
      statusEl.textContent = `Loading ${entry.label}…`;
      try {
        const url = `${import.meta.env.BASE_URL}${entry.url}`;
        const result = await dicomImport.importNiftiFromUrl(url, "dicom-studio-nifti", "MR", entry.label);
        if (myToken !== loadToken) return;
        setPrimaryVolume(result.volume, entry.label);
      } catch (err) {
        if (myToken !== loadToken) return;
        statusEl.textContent = `Failed to load: ${(err as Error).message}`;
        logger.error("NIfTI load failed", err);
      }
    });

    phantomBtn.addEventListener("click", async () => {
      const result = await dicomImport.importSyntheticPhantom("dicom-studio-phantom");
      setPrimaryVolume(result.volume, "Synthetic phantom");
    });

    fusionNiftiSelect.addEventListener("change", async () => {
      const entry = NIFTI_LIBRARY.find((n) => n.id === fusionNiftiSelect.value);
      if (!entry) return;
      try {
        const url = `${import.meta.env.BASE_URL}${entry.url}`;
        const result = await dicomImport.importNiftiFromUrl(url, "dicom-studio-fusion", "MR", entry.label);
        fusionVolume = result.volume;
        fusionWindowLevel = deriveDefaultWindowLevel(result.volume);
        render();
      } catch (err) {
        logger.error("Fusion dataset load failed", err);
      }
    });

    fusionModeGroup.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
      if (!btn) return;
      fusionMode = btn.dataset.mode as FusionMode;
      [...fusionModeGroup.children].forEach((c) => c.classList.toggle("active", c === btn));
      render();
    });

    alphaInput.addEventListener("input", () => {
      fusionAlpha = parseInt(alphaInput.value, 10) / 100;
      container.querySelector<HTMLSpanElement>("#ds-alpha-val")!.textContent = `${alphaInput.value}%`;
      render();
    });

    // --- Window/level controls ---
    wlPreset.addEventListener("change", () => {
      if (wlPreset.value === "auto" && primary) {
        windowLevel = deriveDefaultWindowLevel(primary);
      } else if (CT_WINDOW_PRESETS[wlPreset.value]) {
        windowLevel = { ...CT_WINDOW_PRESETS[wlPreset.value]! };
      }
      wlWidth.value = String(Math.round(windowLevel.width));
      wlLevel.value = String(Math.round(windowLevel.level));
      container.querySelector<HTMLSpanElement>("#ds-wl-width-val")!.textContent = wlWidth.value;
      container.querySelector<HTMLSpanElement>("#ds-wl-level-val")!.textContent = wlLevel.value;
      render();
    });
    wlWidth.addEventListener("input", () => {
      windowLevel = { ...windowLevel, width: parseInt(wlWidth.value, 10) };
      container.querySelector<HTMLSpanElement>("#ds-wl-width-val")!.textContent = wlWidth.value;
      render();
    });
    wlLevel.addEventListener("input", () => {
      windowLevel = { ...windowLevel, level: parseInt(wlLevel.value, 10) };
      container.querySelector<HTMLSpanElement>("#ds-wl-level-val")!.textContent = wlLevel.value;
      render();
    });

    // --- Click-to-navigate + hover HU readout on each pane ---
    const cleanupFns: Array<() => void> = [];
    for (const plane of PLANES) {
      const canvas = canvases[plane];

      const handleClick = (e: MouseEvent) => {
        if (!primary) return;
        const geom = JSON.parse(canvas.dataset.geom ?? "null");
        if (!geom) return;
        const rect = canvas.getBoundingClientRect();
        const canvasX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const canvasY = ((e.clientY - rect.top) / rect.height) * canvas.height;
        const voxel = canvasPointToVoxel(plane, canvasX, canvasY, geom, primary);
        cursor = { ...cursor, ...voxel };
        render();
      };

      const handleMove = (e: MouseEvent) => {
        if (!primary) return;
        const geom = JSON.parse(canvas.dataset.geom ?? "null");
        if (!geom) return;
        const rect = canvas.getBoundingClientRect();
        const canvasX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const canvasY = ((e.clientY - rect.top) / rect.height) * canvas.height;
        const voxel = canvasPointToVoxel(plane, canvasX, canvasY, geom, primary);
        const sampleCoords = { ...cursor, ...voxel };
        const value = sampleVolume(primary, sampleCoords.x, sampleCoords.y, sampleCoords.z);
        readouts[plane].textContent = `${Math.round(value)} ${primary.meta.sourceFormat === "dicom" ? "HU" : ""}`;
      };

      canvas.addEventListener("click", handleClick);
      canvas.addEventListener("mousemove", handleMove);
      cleanupFns.push(() => {
        canvas.removeEventListener("click", handleClick);
        canvas.removeEventListener("mousemove", handleMove);
      });
    }

    return () => {
      cleanupFns.forEach((fn) => fn());
      logger.debug("DICOM Studio module unmounted");
    };
  },
};
