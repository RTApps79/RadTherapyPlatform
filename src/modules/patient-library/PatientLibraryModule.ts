/**
 * RTApps RadTherapyPlatform — Patient Library Module
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * A real, platform-native module (not a legacy iframe wrap) — this is the
 * shared entry point for browsing and selecting a case. "Opening" a case
 * here goes through PatientLibraryService into the actual shared
 * PatientService/WorkflowService/EventBus, so it's a genuine cross-module
 * action: the legacy OIS module (see LegacyIframeModule's patient-selection
 * relay) picks up the selection automatically, whether OIS is already open
 * or gets navigated to afterward.
 */

import type { ModuleDefinition, ModuleContext } from "@core/types";
import { branding } from "@config/branding";
import { PatientLibraryServiceToken } from "@services/tokens";
import type { PatientLibraryRecord } from "@models/patientLibrary";

export const PatientLibraryModule: ModuleDefinition = {
  id: "patient-library",
  title: "Patient Library",
  description: "Large, searchable patient library with search, filters, and case metadata.",
  order: 1,
  status: "active",
  mount(context: ModuleContext) {
    const { container, services, router, logger } = context;
    const patientLibrary = services.resolve(PatientLibraryServiceToken);

    let allRecords: PatientLibraryRecord[] = [];
    let filtered: PatientLibraryRecord[] = [];
    let selectedId: string | null = null;
    let freeText = "";
    let siteFilter = "";
    let intentFilter = "";

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 380px 1fr; gap: 18px; height: 100%; min-height: 0;">
        <div class="rtapps-panel" style="display: flex; flex-direction: column; min-height: 0; padding: 14px;">
          <span class="rtapps-badge rtapps-badge--accent" style="align-self: flex-start; margin-bottom: 8px;">
            Patient Library
          </span>
          <input
            id="pl-search"
            type="text"
            placeholder="Search name, diagnosis, site…"
            style="width: 100%; padding: 8px 10px; border-radius: var(--rtapps-radius-sm); border: 1px solid var(--rtapps-panel-border); background: var(--rtapps-bg-elevated); color: var(--rtapps-text-primary); margin-bottom: 8px; box-sizing: border-box;"
          />
          <div style="display: flex; gap: 6px; margin-bottom: 10px;">
            <select id="pl-site-filter" style="flex: 1; min-width: 0; padding: 6px; border-radius: var(--rtapps-radius-sm); border: 1px solid var(--rtapps-panel-border); background: var(--rtapps-bg-elevated); color: var(--rtapps-text-secondary); font-size: 12px;">
              <option value="">All sites</option>
            </select>
            <select id="pl-intent-filter" style="flex: 1; min-width: 0; padding: 6px; border-radius: var(--rtapps-radius-sm); border: 1px solid var(--rtapps-panel-border); background: var(--rtapps-bg-elevated); color: var(--rtapps-text-secondary); font-size: 12px;">
              <option value="">All intents</option>
              <option value="curative">Curative</option>
              <option value="palliative">Palliative</option>
              <option value="adjuvant">Adjuvant</option>
              <option value="neoadjuvant">Neoadjuvant</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div id="pl-count" style="font-size: 11px; color: var(--rtapps-text-muted); margin-bottom: 8px;">Loading…</div>
          <div id="pl-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;"></div>
        </div>

        <div id="pl-detail" class="rtapps-panel" style="overflow-y: auto;">
          <p style="color: var(--rtapps-text-muted);">Select a patient from the library to view case details.</p>
        </div>
      </div>
    `;

    const searchInput = container.querySelector<HTMLInputElement>("#pl-search")!;
    const siteFilterEl = container.querySelector<HTMLSelectElement>("#pl-site-filter")!;
    const intentFilterEl = container.querySelector<HTMLSelectElement>("#pl-intent-filter")!;
    const countEl = container.querySelector<HTMLDivElement>("#pl-count")!;
    const listEl = container.querySelector<HTMLDivElement>("#pl-list")!;
    const detailEl = container.querySelector<HTMLDivElement>("#pl-detail")!;

    function applyFilters() {
      const ft = freeText.toLowerCase();
      filtered = allRecords.filter((r) => {
        if (ft) {
          const haystack = [r.demographics?.name, r.diagnosis?.primary, r.treatmentPlan?.treatmentSite, r.search]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(ft)) return false;
        }
        if (siteFilter && r.treatmentPlan?.treatmentSite !== siteFilter) return false;
        if (intentFilter) {
          const intent = (r.treatmentPlan?.intent ?? "").toLowerCase();
          const matches =
            (intentFilter === "palliative" && intent.includes("pallia")) ||
            (intentFilter === "neoadjuvant" && intent.includes("neoadjuv")) ||
            (intentFilter === "adjuvant" && intent.includes("adjuv") && !intent.includes("neoadjuv")) ||
            (intentFilter === "curative" && (intent.includes("cur") || intent.includes("definitive"))) ||
            (intentFilter === "other" &&
              !intent.includes("pallia") &&
              !intent.includes("adjuv") &&
              !intent.includes("cur") &&
              !intent.includes("definitive"));
          if (!matches) return false;
        }
        return true;
      });
      renderList();
    }

    function renderList() {
      countEl.textContent = `${filtered.length} of ${allRecords.length} patients`;
      listEl.innerHTML = filtered
        .map((r) => {
          const d = r.demographics ?? {};
          const dx = r.diagnosis ?? {};
          const tp = r.treatmentPlan ?? {};
          const isActive = r.id === selectedId;
          return `
            <button
              data-id="${r.id}"
              style="
                text-align: left; padding: 9px 10px; border-radius: var(--rtapps-radius-sm);
                border: 1px solid ${isActive ? "rgba(34,211,238,0.4)" : "transparent"};
                background: ${isActive ? "var(--rtapps-accent-soft)" : "var(--rtapps-bg-elevated)"};
                color: var(--rtapps-text-primary); cursor: pointer;
              "
            >
              <div style="font-weight: 600; font-size: 13px;">${escapeHtml(d.name ?? "Unknown")}</div>
              <div style="font-size: 11px; color: var(--rtapps-text-secondary); margin-top: 2px;">
                ${escapeHtml(dx.primary ?? "—")}
              </div>
              <div style="font-size: 10px; color: var(--rtapps-text-muted); margin-top: 3px;">
                ${escapeHtml(tp.treatmentSite ?? "")}
              </div>
            </button>
          `;
        })
        .join("");

      listEl.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => selectPatient(btn.dataset.id!));
      });
    }

    function renderDetail(record: PatientLibraryRecord) {
      const d = record.demographics ?? {};
      const dx = record.diagnosis ?? {};
      const tp = record.treatmentPlan ?? {};
      const alerts = Array.isArray(tp.therapistAlerts) ? tp.therapistAlerts : [];

      detailEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <div>
            <h2 style="margin: 0 0 4px;">${escapeHtml(d.name ?? "Unknown")}</h2>
            <div style="color: var(--rtapps-text-secondary); font-size: 13px;">
              MRN ${escapeHtml(record.id)} · ${escapeHtml(d.dob ?? "—")} · ${escapeHtml(d.gender ?? "—")}
            </div>
          </div>
          <button id="pl-open-case" style="background: var(--rtapps-accent); color: #06131c; border: none; padding: 9px 16px; border-radius: var(--rtapps-radius-sm); font-weight: 600; cursor: pointer; white-space: nowrap;">
            Open in OIS
          </button>
        </div>

        <div style="margin-top: 14px; padding: 12px; border-radius: var(--rtapps-radius-md); background: var(--rtapps-bg-elevated); border: 1px solid var(--rtapps-panel-border);">
          <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(dx.primary ?? "—")}</div>
          <div style="color: var(--rtapps-text-secondary); font-size: 13px;">${escapeHtml(dx.location ?? "")}</div>
          <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--rtapps-text-muted); flex-wrap: wrap;">
            ${dx.pathologicStage ? `<span>Stage: ${escapeHtml(dx.pathologicStage)}</span>` : ""}
            ${tp.intent ? `<span>Intent: ${escapeHtml((String(tp.intent).split("(")[0] ?? "").trim())}</span>` : ""}
            ${tp.modality ? `<span>Modality: ${escapeHtml(tp.modality)}</span>` : ""}
          </div>
        </div>

        <div class="rtapps-panel" style="margin-top: 14px;">
          <h3 style="margin-top: 0;">Treatment Plan</h3>
          ${kv("Site", tp.treatmentSite)}
          ${kv("Rx", tp.rtRxDetails ?? [tp.totalDose, tp.fractionation].filter(Boolean).join(" / "))}
          ${kv("Technique", tp.techniqueSummary)}
          ${kv("Concurrent therapy", tp.concurrentChemo)}
        </div>

        ${
          alerts.length
            ? `<div class="rtapps-panel" style="margin-top: 14px; border-color: rgba(251,191,36,0.4);">
                <h3 style="margin-top: 0; color: var(--rtapps-warning);">Therapist Alerts</h3>
                <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: var(--rtapps-text-secondary);">
                  ${alerts.map((a) => `<li style="margin-bottom: 6px;">${escapeHtml(String(a))}</li>`).join("")}
                </ul>
              </div>`
            : ""
        }

        <p style="font-size: 11px; color: var(--rtapps-text-muted); margin-top: 16px;">
          ${branding.nonClinicalDisclaimer}
        </p>
      `;

      detailEl.querySelector<HTMLButtonElement>("#pl-open-case")!.addEventListener("click", async () => {
        await patientLibrary.openCase(record.id);
        logger.info(`Opened case "${record.id}" from Patient Library, navigating to OIS`);
        router.navigate("consultation-ois");
      });
    }

    async function selectPatient(id: string) {
      selectedId = id;
      renderList();
      const record = allRecords.find((r) => r.id === id);
      if (record) renderDetail(record);
    }

    function populateSiteFilter() {
      const sites = new Set<string>();
      allRecords.forEach((r) => {
        const site = r.treatmentPlan?.treatmentSite;
        if (site) sites.add(site);
      });
      siteFilterEl.innerHTML =
        `<option value="">All sites</option>` +
        [...sites]
          .sort()
          .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
          .join("");
    }

    searchInput.addEventListener("input", () => {
      freeText = searchInput.value;
      applyFilters();
    });
    siteFilterEl.addEventListener("change", () => {
      siteFilter = siteFilterEl.value;
      applyFilters();
    });
    intentFilterEl.addEventListener("change", () => {
      intentFilter = intentFilterEl.value;
      applyFilters();
    });

    patientLibrary
      .loadAll()
      .then((records) => {
        allRecords = records;
        filtered = records;
        populateSiteFilter();
        renderList();
      })
      .catch((err: unknown) => {
        countEl.textContent = "Failed to load patient library.";
        logger.error("Failed to load patient library data", err);
      });

    return () => {
      logger.debug("Patient Library module unmounted");
    };
  },
};

function kv(label: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return `
    <div style="display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--rtapps-panel-border-hover); font-size: 13px;">
      <div style="color: var(--rtapps-text-muted); width: 130px; flex-shrink: 0;">${escapeHtml(label)}</div>
      <div style="color: var(--rtapps-text-secondary);">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
