/**
 * RTApps RadTherapyPlatform — Module Host
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Owns the module registry and the currently-mounted module's lifecycle.
 * The AppShell asks the ModuleHost to render into a content element; the
 * ModuleHost listens to the Router and mounts/unmounts modules as the
 * active route changes, calling each module's returned cleanup function
 * (if any) before mounting the next one.
 */

import type { EventBus } from "./EventBus";
import type { Logger } from "./Logger";
import type { PlatformEvents } from "./PlatformEvents";
import type { Router } from "./Router";
import type { ServiceContainer } from "./ServiceContainer";
import type { StateStore } from "./StateStore";
import type { AppState } from "./StateStore";
import type { ModuleDefinition } from "./types";

export class ModuleHost {
  private modules = new Map<string, ModuleDefinition>();
  private activeCleanup: (() => void) | void = undefined;
  private activeModuleId: string | null = null;
  private readonly log: Logger;
  private container: HTMLElement | null = null;

  constructor(
    private readonly router: Router,
    private readonly services: ServiceContainer,
    private readonly eventBus: EventBus<PlatformEvents>,
    private readonly state: StateStore<AppState>,
    logger: Logger,
  ) {
    this.log = logger.scope("ModuleHost");
    this.router.onChange((route) => this.renderRoute(route.moduleId));
  }

  /**
   * Point the host at the DOM element modules should render into. The
   * shell owns that element (it's part of the chrome it builds), so this
   * is called once, right after `AppShell.mount()`, before the first
   * `renderInitial()`.
   */
  attachContainer(container: HTMLElement): void {
    this.container = container;
  }

  private requireContainer(): HTMLElement {
    if (!this.container) {
      throw new Error(
        "ModuleHost: no container attached. Call attachContainer() (typically right " +
          "after AppShell.mount()) before rendering a route.",
      );
    }
    return this.container;
  }

  /** Register a module definition. Call for every module during bootstrap. */
  register(module: ModuleDefinition): void {
    if (this.modules.has(module.id)) {
      this.log.warn(`Module "${module.id}" is already registered — overwriting.`);
    }
    this.modules.set(module.id, module);
  }

  registerAll(modules: ModuleDefinition[]): void {
    modules.forEach((module) => this.register(module));
  }

  getModules(): ModuleDefinition[] {
    return [...this.modules.values()].sort((a, b) => a.order - b.order);
  }

  getModule(id: string): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  /** Render whatever module matches the router's current route. Call once at startup. */
  renderInitial(): void {
    this.renderRoute(this.router.getCurrentRoute().moduleId);
  }

  private renderRoute(moduleId: string): void {
    const module = this.modules.get(moduleId);

    if (!module) {
      this.log.warn(`No module registered for route "${moduleId}" — showing not-found state.`);
      this.unmountActive();
      this.renderNotFound(moduleId);
      this.activeModuleId = null;
      return;
    }

    // Phase 1 always remounts on route change, even for the same module id,
    // so segment/query-only changes still reach the module via context.route.
    this.unmountActive();
    const container = this.requireContainer();
    container.innerHTML = "";

    this.log.info(`Mounting module "${module.id}"`);
    this.state.setState({ activeModuleId: module.id });

    const cleanup = module.mount({
      container,
      services: this.services,
      eventBus: this.eventBus,
      state: this.state,
      logger: this.log.scope(module.id),
      route: this.router.getCurrentRoute(),
    });

    this.activeCleanup = cleanup;
    this.activeModuleId = module.id;
    this.eventBus.emit("module:mounted", { moduleId: module.id });
  }

  private unmountActive(): void {
    if (this.activeModuleId) {
      this.eventBus.emit("module:unmounted", { moduleId: this.activeModuleId });
    }
    if (typeof this.activeCleanup === "function") {
      this.activeCleanup();
    }
    this.activeCleanup = undefined;
  }

  private renderNotFound(moduleId: string): void {
    this.requireContainer().innerHTML = `
      <div class="rtapps-not-found">
        <h2>Module not found</h2>
        <p>No module is registered for route <code>#/${moduleId}</code>.</p>
      </div>
    `;
  }
}
