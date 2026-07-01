/**
 * RTApps RadTherapyPlatform — App Configuration
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 */

import type { DeploymentTarget, LogLevel } from "@core/types";

export interface AppConfig {
  appName: string;
  appVersion: string;
  deploymentTarget: DeploymentTarget;
  logLevel: LogLevel;
  /** Default route/module shown on first load. */
  defaultModuleId: string;
  features: {
    /** Gate for enabling not-yet-stable modules in nav (Phase 6/7 features etc). */
    showExperimentalModules: boolean;
  };
}

function detectDeploymentTarget(): DeploymentTarget {
  // Placeholder detection for Phase 1. Once the desktop shell (Electron/Tauri)
  // and cloud/server deployment exist, this should check a real runtime
  // signal (e.g. `window.rtappsRuntime`) instead of always returning "web".
  return "web";
}

export const appConfig: AppConfig = {
  appName: "RTApps RadTherapyPlatform",
  appVersion: "0.1.0",
  deploymentTarget: detectDeploymentTarget(),
  logLevel: (import.meta.env.DEV ? "debug" : "info") as LogLevel,
  defaultModuleId: "home",
  features: {
    showExperimentalModules: import.meta.env.DEV,
  },
};
