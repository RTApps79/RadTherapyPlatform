// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadDicomSeries } from "@services/imaging/dicomSeriesLoader";
import { loadNiftiVolume } from "@services/imaging/niftiVolumeLoader";
import { generateSyntheticPhantom } from "@services/imaging/syntheticPhantom";
import { sampleVolume } from "@services/imaging/Volume";
import { windowLevelToGray, mapToVolumeCoords, canvasPointToVoxel } from "@services/imaging/mprRenderer";

const DICOM_FIXTURES_DIR = resolve(__dirname, "fixtures/dicom");
const DICOM_FIXTURE_FILES = [
  "slice_000.dcm",
  "slice_005.dcm",
  "slice_010.dcm",
  "slice_015.dcm",
  "slice_020.dcm",
  "slice_025.dcm",
  "slice_030.dcm",
  "slice_035.dcm",
];

function loadFixtureAsFile(name: string): File {
  const buf = readFileSync(join(DICOM_FIXTURES_DIR, name));
  return new File([buf], name, { type: "application/dicom" });
}

describe("dicomSeriesLoader", () => {
  it("loads a real (synthetic-anatomy) DICOM series into a correctly-shaped, HU-calibrated Volume", async () => {
    const files = DICOM_FIXTURE_FILES.map(loadFixtureAsFile);
    const { volume, skippedFiles } = await loadDicomSeries(files);

    expect(skippedFiles).toBe(0);
    expect(volume.cols).toBe(128);
    expect(volume.rows).toBe(128);
    expect(volume.depth).toBe(DICOM_FIXTURE_FILES.length);
    expect(volume.meta.sourceFormat).toBe("dicom");
    expect(volume.meta.modality).toBe("CT");

    // Known phantom HU values baked into the generator: air ~ -1000, bone = 800.
    expect(volume.dataMin).toBeCloseTo(-1000, 0);
    expect(volume.dataMax).toBeGreaterThanOrEqual(700); // bone present in at least one loaded slice
  });

  it("sorts slices by spatial position (ImagePositionPatient Z), not upload order", async () => {
    // Deliberately shuffle the file order before loading.
    const files = [...DICOM_FIXTURE_FILES].reverse().map(loadFixtureAsFile);
    const { volume } = await loadDicomSeries(files);

    // Slice thickness is 2.0mm and files are 5 slices apart (0,5,10,...,35),
    // so z spacing across the whole series should reconstruct to ~10mm.
    expect(volume.spacing.z).toBeCloseTo(10, 0);
  });

  it("reports skipped files rather than throwing when some inputs aren't usable DICOM", async () => {
    const files = [...DICOM_FIXTURE_FILES.map(loadFixtureAsFile), new File([new Uint8Array([1, 2, 3])], "not-dicom.txt")];
    const { volume, skippedFiles, skipped } = await loadDicomSeries(files);

    expect(skippedFiles).toBe(1);
    expect(volume.depth).toBe(DICOM_FIXTURE_FILES.length);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.filename).toBe("not-dicom.txt");
    expect(skipped[0]?.reason).toBe("not-dicom");
  });

  it("distinguishes a non-image DICOM object (e.g. a Structured Report) with its own skip reason", async () => {
    const files = [...DICOM_FIXTURE_FILES.map(loadFixtureAsFile), loadFixtureAsFile("synthetic-dicom-no-pixels.dcm")];
    const { skipped } = await loadDicomSeries(files);

    const reportSkip = skipped.find((s) => s.filename === "synthetic-dicom-no-pixels.dcm");
    expect(reportSkip?.reason).toBe("no-pixel-data");
  });

  it("throws a clear error when no file is usable DICOM", async () => {
    const files = [new File([new Uint8Array([1, 2, 3])], "junk.txt")];
    await expect(loadDicomSeries(files)).rejects.toThrow(/no usable DICOM/);
  });

  it("correctly reads real pixel data (not garbage) — center-of-body voxel is soft tissue, not air", async () => {
    const files = DICOM_FIXTURE_FILES.map(loadFixtureAsFile);
    const { volume } = await loadDicomSeries(files);

    const centerHu = sampleVolume(volume, volume.cols / 2, volume.rows / 2, volume.depth / 2);
    // Center of the phantom body is soft tissue (~15-65 HU in the generator), never air (-1000) or bone (800).
    expect(centerHu).toBeGreaterThan(-500);
    expect(centerHu).toBeLessThan(500);
  });
});

describe("niftiVolumeLoader", () => {
  beforeEach(() => {
    const niftiPath = resolve(
      __dirname,
      "../../public/data/imaging/brain-mri/brain-mets-prototype-001/flair.nii.gz",
    );
    const bytes = readFileSync(niftiPath);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      }),
    );
  });

  it("loads the real shipped brain MRI volume into the shared Volume shape", async () => {
    const volume = await loadNiftiVolume("irrelevant-url", "FLAIR test");
    // Cross-check against values independently verified in the CT Simulation module's own testing.
    expect(volume.cols).toBe(192);
    expect(volume.rows).toBe(256);
    expect(volume.depth).toBe(22);
    expect(volume.meta.sourceFormat).toBe("nifti");
    expect(volume.dataMax).toBe(701);
    expect(volume.dataMin).toBe(0);
  });
});

describe("generateSyntheticPhantom", () => {
  it("produces a well-formed Volume with the expected HU landmarks", () => {
    const volume = generateSyntheticPhantom(80, 80, 48);
    expect(volume.cols).toBe(80);
    expect(volume.rows).toBe(80);
    expect(volume.depth).toBe(48);
    expect(volume.meta.sourceFormat).toBe("synthetic");
    expect(volume.dataMin).toBeLessThan(-500); // air present
    expect(volume.dataMax).toBeGreaterThanOrEqual(800); // bone present
  });
});

describe("mprRenderer pure logic", () => {
  it("windowLevelToGray maps the window range linearly to 0-255 and clamps outside it", () => {
    const wl = { width: 400, level: 40 }; // soft tissue: range -160..240
    expect(windowLevelToGray(-160, wl)).toBe(0);
    expect(windowLevelToGray(240, wl)).toBe(255);
    expect(windowLevelToGray(40, wl)).toBe(128); // level = mid-gray
    expect(windowLevelToGray(-1000, wl)).toBe(0); // clamped, not negative
    expect(windowLevelToGray(3000, wl)).toBe(255); // clamped, not >255
  });

  it("mapToVolumeCoords: axial holds z fixed at the cursor", () => {
    const volume = { depth: 50 } as never;
    const cursor = { x: 10, y: 20, z: 30 };
    expect(mapToVolumeCoords("axial", 5, 7, cursor, volume)).toEqual([5, 7, 30]);
  });

  it("mapToVolumeCoords: coronal holds y fixed and flips the z axis for correct superior-up orientation", () => {
    const volume = { depth: 50 } as never;
    const cursor = { x: 10, y: 20, z: 30 };
    // i -> x, j -> depth-1-j (flipped)
    expect(mapToVolumeCoords("coronal", 5, 7, cursor, volume)).toEqual([5, 20, 50 - 1 - 7]);
  });

  it("mapToVolumeCoords: sagittal holds x fixed and flips the z axis", () => {
    const volume = { depth: 50 } as never;
    const cursor = { x: 10, y: 20, z: 30 };
    expect(mapToVolumeCoords("sagittal", 5, 7, cursor, volume)).toEqual([10, 5, 50 - 1 - 7]);
  });

  it("canvasPointToVoxel inverts the same geometry renderMprSlice produces", () => {
    const volume = { depth: 50 } as never;
    const geom = { scale: 2, offsetX: 10, offsetY: 10, sliceWidth: 100, sliceHeight: 100 };
    const result = canvasPointToVoxel("axial", 30, 50, geom, volume);
    expect(result.x).toBeCloseTo((30 - 10) / 2);
    expect(result.y).toBeCloseTo((50 - 10) / 2);
  });
});
