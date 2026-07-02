import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "@core/EventBus";
import { Logger } from "@core/Logger";
import type { PlatformEvents } from "@core/PlatformEvents";
import { PatientService } from "@services/PatientService";
import { WorkflowService } from "@services/WorkflowService";
import { PatientLibraryService } from "@services/PatientLibraryService";
import type { PatientLibraryRecord } from "@models/patientLibrary";

const SAMPLE_RECORDS: PatientLibraryRecord[] = [
  {
    id: "P001",
    demographics: { name: "Jane Doe", dob: "1970-01-01", gender: "Female" },
    diagnosis: { primary: "Breast Cancer", pathologicStage: "Stage IIA" },
    treatmentPlan: {
      treatmentSite: "Left Breast",
      intent: "Adjuvant (post-lumpectomy)",
      therapistAlerts: ["Watch for skin reaction"],
    },
  },
  {
    id: "P002",
    demographics: { name: "John Smith", dob: "1955-06-15", gender: "Male" },
    diagnosis: { primary: "Prostate Adenocarcinoma", overallStage: "Stage III" },
    treatmentPlan: { treatmentSite: "Prostate Gland", intent: "Definitive (Curative)" },
  },
  {
    id: "P003",
    demographics: { name: "Amir Khan", dob: "1990-03-20", gender: "Male" },
    diagnosis: { primary: "Bone Metastasis" },
    treatmentPlan: { treatmentSite: "L3 Vertebral Body", intent: "Palliative (pain control)" },
  },
];

function buildServices() {
  const eventBus = new EventBus<PlatformEvents>();
  const logger = new Logger("test", "error");
  const patientService = new PatientService(eventBus);
  const workflowService = new WorkflowService(eventBus);
  const patientLibraryService = new PatientLibraryService(patientService, workflowService, logger);
  return { eventBus, patientService, workflowService, patientLibraryService };
}

describe("PatientLibraryService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => SAMPLE_RECORDS,
      }),
    );
  });

  it("loads and caches the dataset (only fetches once across repeated calls)", async () => {
    const { patientLibraryService } = buildServices();
    const first = await patientLibraryService.loadAll();
    const second = await patientLibraryService.loadAll();

    expect(first).toHaveLength(3);
    expect(second).toBe(first); // same cached array reference
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("getById finds a record by its library id", async () => {
    const { patientLibraryService } = buildServices();
    const record = await patientLibraryService.getById("P002");
    expect(record?.demographics.name).toBe("John Smith");
  });

  it("search matches free text across name, diagnosis, site, and search hint", async () => {
    const { patientLibraryService } = buildServices();
    const results = await patientLibraryService.search({ freeText: "breast" });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("P001");
  });

  it("search filters by exact treatment site", async () => {
    const { patientLibraryService } = buildServices();
    const results = await patientLibraryService.search({ treatmentSite: "Prostate Gland" });
    expect(results.map((r) => r.id)).toEqual(["P002"]);
  });

  it("search filters by inferred treatment intent", async () => {
    const { patientLibraryService } = buildServices();
    const palliative = await patientLibraryService.search({ intent: "palliative" });
    expect(palliative.map((r) => r.id)).toEqual(["P003"]);

    const curative = await patientLibraryService.search({ intent: "curative" });
    expect(curative.map((r) => r.id)).toEqual(["P002"]);
  });

  it("openCase upserts a matching Patient using the library record's own id (not a generated one)", async () => {
    const { patientService, patientLibraryService } = buildServices();
    await patientLibraryService.openCase("P001");

    const patient = patientService.get("P001");
    expect(patient).toBeDefined();
    expect(patient?.firstName).toBe("Jane");
    expect(patient?.lastName).toBe("Doe");
    expect(patient?.sex).toBe("F");
    expect(patient?.cancerSite).toBe("Left Breast");
    expect(patient?.treatmentIntent).toBe("adjuvant");
  });

  it("openCase fires patient:selected and starts a workflow case", async () => {
    const { eventBus, workflowService, patientLibraryService } = buildServices();
    const selectedHandler = vi.fn();
    eventBus.on("patient:selected", selectedHandler);

    await patientLibraryService.openCase("P002");

    expect(selectedHandler).toHaveBeenCalledWith({ patientId: "P002" });
    expect(workflowService.getCase("case-P002")).toBeDefined();
  });

  it("openCase throws a clear error for an unknown id", async () => {
    const { patientLibraryService } = buildServices();
    await expect(patientLibraryService.openCase("does-not-exist")).rejects.toThrow(/does-not-exist/);
  });

  it("infers sex correctly from varied gender strings, defaulting to U when unclear", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "A", demographics: { name: "A B", dob: "", gender: "male" }, diagnosis: { primary: "x" }, treatmentPlan: {} },
          { id: "B", demographics: { name: "C D", dob: "", gender: "FEMALE" }, diagnosis: { primary: "x" }, treatmentPlan: {} },
          { id: "C", demographics: { name: "E F", dob: "", gender: "" }, diagnosis: { primary: "x" }, treatmentPlan: {} },
        ] satisfies PatientLibraryRecord[],
      }),
    );
    const { patientService, patientLibraryService } = buildServices();
    await patientLibraryService.openCase("A");
    await patientLibraryService.openCase("B");
    await patientLibraryService.openCase("C");

    expect(patientService.get("A")?.sex).toBe("M");
    expect(patientService.get("B")?.sex).toBe("F");
    expect(patientService.get("C")?.sex).toBe("U");
  });
});
