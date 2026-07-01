/**
 * RTApps RadTherapyPlatform — Service Container
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 *
 * A minimal DI container. Core services (PatientService, ImagingDatasetRegistry,
 * DicomImportService, PlanService, CourseService, WorkflowService, ...) are
 * registered here once at startup, so every module resolves the *same*
 * shared instance instead of creating its own local copy of platform state.
 *
 * Use the exported `ServiceToken<T>` helper to get compile-time-safe
 * resolution without relying on string-keyed `any`.
 */

/**
 * A typed handle used to register/resolve a service. `__phantom` never
 * exists at runtime (the factory below never sets it) — its only job is
 * to make `T` participate in the type's shape, so `ServiceToken<Foo>` and
 * `ServiceToken<Bar>` aren't structurally interchangeable.
 */
export interface ServiceToken<T> {
  readonly description: string;
  readonly __phantom?: T;
}

export function createToken<T>(description: string): ServiceToken<T> {
  return { description } as ServiceToken<T>;
}

type Factory<T> = (container: ServiceContainer) => T;

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

export class ServiceContainer {
  private registry = new Map<ServiceToken<unknown>, Registration<unknown>>();

  /** Register a singleton service — the factory runs once, on first resolve. */
  registerSingleton<T>(token: ServiceToken<T>, factory: Factory<T>): void {
    this.registry.set(token as ServiceToken<unknown>, {
      factory: factory as Factory<unknown>,
      singleton: true,
    });
  }

  /** Register a factory that runs fresh on every resolve. */
  registerTransient<T>(token: ServiceToken<T>, factory: Factory<T>): void {
    this.registry.set(token as ServiceToken<unknown>, {
      factory: factory as Factory<unknown>,
      singleton: false,
    });
  }

  /** Register an already-constructed instance directly. */
  registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    this.registry.set(token as ServiceToken<unknown>, {
      factory: () => instance,
      singleton: true,
      instance,
    });
  }

  resolve<T>(token: ServiceToken<T>): T {
    const registration = this.registry.get(token as ServiceToken<unknown>) as
      | Registration<T>
      | undefined;

    if (!registration) {
      throw new Error(
        `ServiceContainer: no registration found for "${token.description}". ` +
          `Did you forget to register it during platform bootstrap?`,
      );
    }

    if (registration.singleton) {
      if (registration.instance === undefined) {
        registration.instance = registration.factory(this);
      }
      return registration.instance;
    }

    return registration.factory(this);
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.registry.has(token as ServiceToken<unknown>);
  }
}
