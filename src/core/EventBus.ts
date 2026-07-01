/**
 * RTApps RadTherapyPlatform — Event Bus
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * Modules must not reach into each other's DOM or local state. Instead,
 * they publish and subscribe to events here. This keeps OIS, CT Simulation,
 * TPS, Physics, and Treatment Delivery decoupled while still able to react
 * to the same shared dataset / workflow changes in real time.
 */

import type { EventMap, Unsubscribe } from "./types";

type Listener<T> = (payload: T) => void;

/** Emitted for every event, useful for the audit/logging service. */
export interface WildcardEvent<M extends EventMap> {
  type: keyof M;
  payload: M[keyof M];
  timestamp: number;
}

export class EventBus<M extends EventMap = EventMap> {
  private listeners = new Map<keyof M, Set<Listener<unknown>>>();
  private wildcardListeners = new Set<Listener<WildcardEvent<M>>>();

  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  on<K extends keyof M>(type: K, listener: Listener<M[K]>): Unsubscribe {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as Listener<unknown>);
    return () => this.off(type, listener);
  }

  /** Subscribe once; automatically unsubscribes after the first emission. */
  once<K extends keyof M>(type: K, listener: Listener<M[K]>): Unsubscribe {
    const wrapped: Listener<M[K]> = (payload) => {
      unsubscribe();
      listener(payload);
    };
    const unsubscribe = this.on(type, wrapped);
    return unsubscribe;
  }

  /** Subscribe to every event that passes through the bus (used by audit/logging). */
  onAny(listener: Listener<WildcardEvent<M>>): Unsubscribe {
    this.wildcardListeners.add(listener);
    return () => this.wildcardListeners.delete(listener);
  }

  off<K extends keyof M>(type: K, listener: Listener<M[K]>): void {
    this.listeners.get(type)?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    this.listeners.get(type)?.forEach((listener) => listener(payload));
    if (this.wildcardListeners.size > 0) {
      const event: WildcardEvent<M> = { type, payload, timestamp: Date.now() };
      this.wildcardListeners.forEach((listener) => listener(event));
    }
  }

  /** Remove all listeners for a given type, or every listener if omitted. */
  clear(type?: keyof M): void {
    if (type) {
      this.listeners.delete(type);
    } else {
      this.listeners.clear();
      this.wildcardListeners.clear();
    }
  }
}
