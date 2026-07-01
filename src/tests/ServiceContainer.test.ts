import { describe, it, expect } from "vitest";
import { ServiceContainer, createToken } from "@core/ServiceContainer";

class Counter {
  value = 0;
}

describe("ServiceContainer", () => {
  it("resolves a registered singleton to the same instance every time", () => {
    const container = new ServiceContainer();
    const token = createToken<Counter>("Counter");
    container.registerSingleton(token, () => new Counter());

    const first = container.resolve(token);
    const second = container.resolve(token);

    expect(first).toBe(second);
  });

  it("resolves a transient registration to a new instance every time", () => {
    const container = new ServiceContainer();
    const token = createToken<Counter>("Counter");
    container.registerTransient(token, () => new Counter());

    const first = container.resolve(token);
    const second = container.resolve(token);

    expect(first).not.toBe(second);
  });

  it("throws a clear error when resolving an unregistered token", () => {
    const container = new ServiceContainer();
    const token = createToken<Counter>("Counter");

    expect(() => container.resolve(token)).toThrow(/Counter/);
  });

  it("has() reflects whether a token is registered", () => {
    const container = new ServiceContainer();
    const token = createToken<Counter>("Counter");

    expect(container.has(token)).toBe(false);
    container.registerInstance(token, new Counter());
    expect(container.has(token)).toBe(true);
  });
});
