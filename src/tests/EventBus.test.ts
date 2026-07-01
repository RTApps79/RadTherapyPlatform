import { describe, it, expect, vi } from "vitest";
import { EventBus } from "@core/EventBus";
import type { EventMap } from "@core/types";

interface TestEvents extends EventMap {
  "thing:happened": { id: string };
  "other:thing": { count: number };
}

describe("EventBus", () => {
  it("delivers events to subscribed listeners", () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on("thing:happened", handler);

    bus.emit("thing:happened", { id: "abc" });

    expect(handler).toHaveBeenCalledWith({ id: "abc" });
  });

  it("does not deliver events to listeners of a different type", () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on("thing:happened", handler);

    bus.emit("other:thing", { count: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops delivering events after unsubscribe", () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on("thing:happened", handler);

    unsubscribe();
    bus.emit("thing:happened", { id: "abc" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("once() fires exactly one time", () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once("thing:happened", handler);

    bus.emit("thing:happened", { id: "a" });
    bus.emit("thing:happened", { id: "b" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: "a" });
  });

  it("onAny() receives every event with type + timestamp", () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.onAny(handler);

    bus.emit("thing:happened", { id: "abc" });

    expect(handler).toHaveBeenCalledTimes(1);
    const [event] = handler.mock.calls[0]!;
    expect(event.type).toBe("thing:happened");
    expect(event.payload).toEqual({ id: "abc" });
    expect(typeof event.timestamp).toBe("number");
  });
});
