/**
 * RTApps RadTherapyPlatform — State Store
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * A minimal, dependency-free reactive store for app-level state that many
 * modules need to read/react to at once (current patient, active case,
 * current workflow stage, active dataset). Domain data itself (the actual
 * Patient/Study/Plan records) belongs in the relevant service + registry,
 * not here — this store holds *selection/session* state, not the dataset.
 */

import type { Unsubscribe } from "./types";

export interface AppState {
  currentPatientId: string | null;
  currentCaseId: string | null;
  activeDatasetId: string | null;
  activeModuleId: string | null;
  workflowStage: string | null;
  deploymentTarget: "desktop" | "web" | "cloud";
}

export const initialAppState: AppState = {
  currentPatientId: null,
  currentCaseId: null,
  activeDatasetId: null,
  activeModuleId: null,
  workflowStage: null,
  deploymentTarget: "web",
};

type Selector<S, T> = (state: S) => T;
type Listener<T> = (value: T, previous: T) => void;

export class StateStore<S extends object> {
  private state: S;
  private listeners = new Set<{
    selector: Selector<S, unknown>;
    listener: Listener<unknown>;
    lastValue: unknown;
  }>();

  constructor(initial: S) {
    this.state = initial;
  }

  getState(): Readonly<S> {
    return this.state;
  }

  /** Shallow-merge a partial update and notify affected subscribers. */
  setState(patch: Partial<S>): void {
    const previous = this.state;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((entry) => {
      const nextValue = entry.selector(this.state);
      if (!Object.is(nextValue, entry.lastValue)) {
        const prevValue = entry.selector(previous);
        entry.lastValue = nextValue;
        entry.listener(nextValue, prevValue);
      }
    });
  }

  /**
   * Subscribe to a slice of state via a selector. Only fires when the
   * selected value actually changes (reference equality).
   */
  subscribe<T>(selector: Selector<S, T>, listener: Listener<T>): Unsubscribe {
    const entry = {
      selector: selector as Selector<S, unknown>,
      listener: listener as Listener<unknown>,
      lastValue: selector(this.state),
    };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }
}
