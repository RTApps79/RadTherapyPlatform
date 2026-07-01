/**
 * RTApps RadTherapyPlatform — Application Shell
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Builds the persistent chrome (header, workflow navigation, content
 * area, footer) and wires it to the Router/ModuleHost/StateStore. This is
 * the only place that renders the always-on RTApps branding and the
 * "Educational simulation — not for clinical use" disclaimer, per the
 * brief's requirement that every module display it.
 */

import type { ModuleHost } from "@core/ModuleHost";
import type { Router } from "@core/Router";
import type { StateStore, AppState } from "@core/StateStore";
import type { ModuleDefinition } from "@core/types";
import { branding } from "@config/branding";
import { appConfig } from "@config/AppConfig";

export class AppShell {
  private navEl!: HTMLElement;
  private contentEl!: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly router: Router,
    private readonly moduleHost: ModuleHost,
    private readonly state: StateStore<AppState>,
  ) {}

  mount(): void {
    this.root.innerHTML = `
      <div class="rtapps-shell">
        <header class="rtapps-header">
          <img class="rtapps-header__logo" src="${import.meta.env.BASE_URL}rtapps-icon.svg" alt="${branding.productShortName} logo" />
          <span class="rtapps-header__title">${branding.productFullName}</span>
          <span class="rtapps-header__tagline">${branding.tagline}</span>
          <span class="rtapps-header__disclaimer">${branding.nonClinicalDisclaimer}</span>
        </header>

        <nav class="rtapps-nav" id="rtapps-nav" aria-label="Workflow modules"></nav>

        <main class="rtapps-content" id="rtapps-content"></main>

        <footer class="rtapps-footer">
          <span>${branding.copyrightLine}</span>
          <span>v${appConfig.appVersion} · ${appConfig.deploymentTarget}</span>
        </footer>
      </div>
    `;

    this.navEl = this.root.querySelector("#rtapps-nav")!;
    this.contentEl = this.root.querySelector("#rtapps-content")!;

    this.renderNav();
    this.state.subscribe(
      (s) => s.activeModuleId,
      () => this.renderNav(),
    );
  }

  /** The element modules should mount their UI into. */
  getContentElement(): HTMLElement {
    return this.contentEl;
  }

  private renderNav(): void {
    const modules = this.moduleHost.getModules();
    const activeModuleId = this.state.getState().activeModuleId;

    this.navEl.innerHTML = "";

    const label = document.createElement("div");
    label.className = "rtapps-nav__section-label";
    label.textContent = "Workflow";
    this.navEl.appendChild(label);

    modules.forEach((module) => {
      this.navEl.appendChild(this.buildNavItem(module, module.id === activeModuleId));
    });
  }

  private buildNavItem(module: ModuleDefinition, isActive: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rtapps-nav__item";
    button.title = module.description ?? module.title;
    if (isActive) button.setAttribute("aria-current", "page");

    const index = document.createElement("span");
    index.className = "rtapps-nav__item-index";
    index.textContent = module.order > 0 ? String(module.order) : "•";

    const title = document.createElement("span");
    title.textContent = module.title;

    button.appendChild(index);
    button.appendChild(title);

    if (module.status !== "active") {
      const status = document.createElement("span");
      status.className = "rtapps-nav__item-status";
      status.textContent = module.status === "legacy-wrapped" ? "legacy" : module.status;
      button.appendChild(status);
    }

    button.addEventListener("click", () => this.router.navigate(module.id));
    return button;
  }
}
