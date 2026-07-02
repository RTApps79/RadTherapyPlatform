/**
 * RTApps RadTherapyPlatform — Legacy Iframe Module Factory
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Phase 2 — Legacy Module Integration.
 *
 * Wraps an existing standalone HTML/JS app (OIS, TPS, or any other legacy
 * tool) as a first-class ModuleDefinition by loading it into an iframe
 * pointed at a static asset path under `public/legacy/<name>/`. The legacy
 * app runs entirely unmodified — its own document, its own CSS/JS scope —
 * so wrapping it here carries zero risk of breaking its existing behavior.
 *
 * This intentionally does NOT share the platform's EventBus/ServiceContainer
 * with the legacy app's JS by default. See `legacyBridge.ts` for the
 * opt-in postMessage contract to use once you're ready to have the legacy
 * app react to platform events (e.g. "patient selected") or notify the
 * platform of its own state changes. Phase 3 (Imaging Core Extraction) is
 * where the deeper integration — actually sharing the dataset registry —
 * happens; this wrapper is deliberately the "quick, safe, working" step
 * the brief calls for first.
 */

import type { ModuleDefinition, ModuleContext } from "@core/types";
import { branding } from "@config/branding";
import { isLegacyBridgeOutbound } from "./legacyBridge";

export interface LegacyIframeModuleConfig {
  id: string;
  title: string;
  description: string;
  order: number;
  /** Path under `public/`, e.g. "legacy/ois/index.html". Resolved against the app's BASE_URL. */
  srcPath: string;
}

export function createLegacyIframeModule(config: LegacyIframeModuleConfig): ModuleDefinition {
  return {
    id: config.id,
    title: config.title,
    description: config.description,
    order: config.order,
    status: "legacy-wrapped",
    mount(context: ModuleContext) {
      const { container, logger } = context;

      container.innerHTML = "";

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "height: 100%; display: flex; flex-direction: column; gap: 8px;";

      const badgeRow = document.createElement("div");
      badgeRow.innerHTML = `
        <span class="rtapps-badge">Legacy module</span>
        <span style="color: var(--rtapps-text-muted); font-size: 11px; margin-left: 8px;">
          ${branding.nonClinicalDisclaimer}
        </span>
      `;

      const iframe = document.createElement("iframe");
      iframe.src = `${import.meta.env.BASE_URL}${config.srcPath}`;
      iframe.title = config.title;
      iframe.style.cssText = `
        flex: 1;
        width: 100%;
        border: 1px solid var(--rtapps-panel-border);
        border-radius: var(--rtapps-radius-md);
        background: #fff;
      `;
      // No `sandbox` attribute: this is first-party legacy code served from
      // the same origin, and sandboxing without `allow-same-origin` would
      // break same-origin fetches/localStorage the legacy app may rely on.

      wrapper.appendChild(badgeRow);
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        if (!isLegacyBridgeOutbound(event.data)) return;

        logger.debug(`Legacy bridge message from "${config.id}": ${event.data.type}`, event.data.payload);

        if (event.data.type === "ready") {
          logger.info(`Legacy module "${config.id}" signaled ready`);
        }
      };
      window.addEventListener("message", handleMessage);

      logger.info(`Mounted legacy iframe module "${config.id}" -> ${iframe.src}`);

      return () => {
        window.removeEventListener("message", handleMessage);
        logger.debug(`Unmounted legacy iframe module "${config.id}"`);
      };
    },
  };
}
