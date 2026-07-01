/**
 * RTApps RadTherapyPlatform — Router
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Hash-based routing so the platform works unmodified on GitHub Pages and
 * other static hosts (no server-side rewrite rules required). Later phases
 * can swap in the History API for desktop/Electron or server-rendered
 * deployments without touching module code, since modules only ever see a
 * parsed RouteMatch, never the raw URL.
 *
 * Route shape: #/<moduleId>/<segment>/<segment>?key=value&key2=value2
 * Example:     #/ct-simulation/case/1042?tab=setup
 */

import type { RouteMatch, Unsubscribe } from "./types";

type RouteListener = (route: RouteMatch) => void;

export class Router {
  private listeners = new Set<RouteListener>();
  private current: RouteMatch;

  constructor(private readonly defaultModuleId: string = "home") {
    this.current = this.parse(window.location.hash);
    window.addEventListener("hashchange", this.handleHashChange);
  }

  private handleHashChange = (): void => {
    this.current = this.parse(window.location.hash);
    this.listeners.forEach((listener) => listener(this.current));
  };

  private parse(hash: string): RouteMatch {
    const raw = hash.replace(/^#\/?/, "");
    const [pathPart = "", queryPart] = raw.split("?");
    const segments = pathPart.split("/").filter(Boolean);
    const moduleId = segments.shift() ?? this.defaultModuleId;

    const query: Record<string, string> = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((value, key) => {
        query[key] = value;
      });
    }

    return { moduleId: moduleId || this.defaultModuleId, segments, query };
  }

  getCurrentRoute(): RouteMatch {
    return this.current;
  }

  /** Programmatically navigate. Triggers the same listeners as a hash change. */
  navigate(moduleId: string, segments: string[] = [], query: Record<string, string> = {}): void {
    const path = [moduleId, ...segments].join("/");
    const queryString = new URLSearchParams(query).toString();
    window.location.hash = queryString ? `/${path}?${queryString}` : `/${path}`;
  }

  onChange(listener: RouteListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    window.removeEventListener("hashchange", this.handleHashChange);
    this.listeners.clear();
  }
}
