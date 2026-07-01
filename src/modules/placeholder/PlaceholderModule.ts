/**
 * RTApps RadTherapyPlatform — Placeholder Module Factory
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Phase 1 registers every workflow-area module (Patient Library, OIS, CT
 * Simulation, ...) as a real, routable ModuleDefinition so the shell's
 * navigation and module host are fully exercised end-to-end — but most of
 * them render this placeholder screen until Phase 2 (legacy module
 * wrapping) and later phases replace `mount()` with the real UI.
 */

import type { ModuleDefinition, ModuleContext } from "@core/types";
import { branding } from "@config/branding";

export interface PlaceholderModuleConfig {
  id: string;
  title: string;
  description: string;
  order: number;
  /** What replaces this placeholder, shown to orient contributors. */
  plannedIn: string;
}

export function createPlaceholderModule(config: PlaceholderModuleConfig): ModuleDefinition {
  return {
    id: config.id,
    title: config.title,
    description: config.description,
    order: config.order,
    status: "placeholder",
    mount(context: ModuleContext) {
      context.logger.info(`Placeholder mounted for "${config.id}"`);

      context.container.innerHTML = `
        <div class="rtapps-panel" style="max-width: 720px;">
          <span class="rtapps-badge">Not yet integrated</span>
          <h2 style="margin-top: 12px;">${config.title}</h2>
          <p style="color: var(--rtapps-text-secondary);">${config.description}</p>
          <p style="color: var(--rtapps-text-muted); font-size: 13px;">
            Planned in: <strong>${config.plannedIn}</strong>
          </p>
          <p style="color: var(--rtapps-text-muted); font-size: 12px; margin-top: 20px;">
            ${branding.nonClinicalDisclaimer}
          </p>
        </div>
      `;

      return () => {
        context.logger.debug(`Placeholder unmounted for "${config.id}"`);
      };
    },
  };
}
