/**
 * RTApps RadTherapyPlatform — Core Types
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Cross-cutting types shared by the event bus, state store, service
 * container, router, and module host. Domain models (Patient, Course,
 * TreatmentPlan, etc.) live in `src/models`, not here.
 */

import type { ServiceContainer } from "./ServiceContainer";
import type { EventBus } from "./EventBus";
import type { PlatformEvents } from "./PlatformEvents";
import type { StateStore, AppState } from "./StateStore";
import type { Logger } from "./Logger";

/** Log severity levels, low to high. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Deployment target the shell is currently running under. */
export type DeploymentTarget = "desktop" | "web" | "cloud";

/**
 * A single entry in the platform's module registry. Each major workflow
 * area (Patient Library, OIS, CT Simulation, DICOM Studio, TPS, Physics,
 * Treatment Delivery, Education, Reports) is registered as a module and
 * mounted by the ModuleHost when its route becomes active.
 */
export interface ModuleContext {
  container: HTMLElement;
  services: ServiceContainer;
  eventBus: EventBus<PlatformEvents>;
  state: StateStore<AppState>;
  logger: Logger;
  route: RouteMatch;
}

export interface ModuleDefinition {
  /** Stable identifier, also used as the route segment, e.g. "patient-library". */
  id: string;
  /** Display name shown in navigation. */
  title: string;
  /** Short description shown in nav tooltips / module cards. */
  description?: string;
  /** Workflow position, used to order navigation (1 = Patient Library, etc.). */
  order: number;
  /** Whether this module is fully implemented yet, or a Phase 1 placeholder. */
  status: "planned" | "placeholder" | "legacy-wrapped" | "active";
  /** Mount the module's UI into the provided container. Returns an optional cleanup fn. */
  mount(context: ModuleContext): void | (() => void);
}

/** A parsed route, produced by the Router from the current URL hash. */
export interface RouteMatch {
  /** Module id / path segment, e.g. "ct-simulation". */
  moduleId: string;
  /** Remaining path segments after the module id, e.g. ["case", "1042"]. */
  segments: string[];
  /** Parsed query parameters from the hash route. */
  query: Record<string, string>;
}

/** Generic event map constraint used by the EventBus. */
export type EventMap = Record<string, unknown>;

/** Unsubscribe handle returned by EventBus.on / StateStore.subscribe. */
export type Unsubscribe = () => void;
