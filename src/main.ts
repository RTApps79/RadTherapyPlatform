/**
 * RTApps RadTherapyPlatform — Entry Point
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Bootstrap order:
 *   1. Core primitives (Logger, EventBus, StateStore, ServiceContainer)
 *   2. Core services (registerCoreServices)
 *   3. Router
 *   4. ModuleHost (needs router + services + eventBus + state)
 *   5. AppShell (renders chrome — header, nav, content area, footer)
 *   6. Attach the shell's content element to the ModuleHost
 *   7. Register modules and render the initial route
 */

import "@styles/global.css";

import { Logger } from "@core/Logger";
import { EventBus } from "@core/EventBus";
import type { PlatformEvents } from "@core/PlatformEvents";
import { StateStore, initialAppState } from "@core/StateStore";
import { ServiceContainer } from "@core/ServiceContainer";
import { Router } from "@core/Router";
import { ModuleHost } from "@core/ModuleHost";

import { registerCoreServices } from "@services/index";
import { buildModuleRegistry } from "@modules/registry";
import { AppShell } from "@shell/AppShell";
import { appConfig } from "@config/AppConfig";

function bootstrap(): void {
  const logger = new Logger("rtapps", appConfig.logLevel);
  logger.info(`Starting ${appConfig.appName} v${appConfig.appVersion} (${appConfig.deploymentTarget})`);

  const eventBus = new EventBus<PlatformEvents>();
  const state = new StateStore({ ...initialAppState, deploymentTarget: appConfig.deploymentTarget });
  const services = new ServiceContainer();
  registerCoreServices(services, eventBus, logger);

  const router = new Router(appConfig.defaultModuleId);
  const moduleHost = new ModuleHost(router, services, eventBus, state, logger);

  // Cross-cutting event -> state sync. Kept centralized here (rather than
  // inside PatientService) so services stay decoupled from StateStore;
  // this is the one place that translates "something happened" events
  // into "current session state" that any module can read.
  eventBus.on("patient:selected", ({ patientId }) => {
    state.setState({ currentPatientId: patientId });
  });

  const root = document.getElementById("app-root");
  if (!root) {
    throw new Error("main.ts: #app-root element not found in index.html");
  }

  const shell = new AppShell(root, router, moduleHost, state);
  shell.mount();
  moduleHost.attachContainer(shell.getContentElement());

  moduleHost.registerAll(buildModuleRegistry());
  moduleHost.renderInitial();

  // Lightweight audit trail for Phase 1 — a real AuditService/logging sink
  // (per the brief's "Logging & Audit" core service) replaces this call in
  // a later phase without touching module code, since it only depends on
  // the EventBus's public onAny() API.
  eventBus.onAny((event) => {
    logger.debug(`event: ${String(event.type)}`, event.payload);
  });

  logger.info("Bootstrap complete");
}

bootstrap();
