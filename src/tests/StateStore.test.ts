import { describe, it, expect, vi } from "vitest";
import { StateStore } from "@core/StateStore";

interface TestState {
  count: number;
  label: string;
}

describe("StateStore", () => {
  it("returns the initial state", () => {
    const store = new StateStore<TestState>({ count: 0, label: "start" });
    expect(store.getState()).toEqual({ count: 0, label: "start" });
  });

  it("merges partial updates", () => {
    const store = new StateStore<TestState>({ count: 0, label: "start" });
    store.setState({ count: 5 });
    expect(store.getState()).toEqual({ count: 5, label: "start" });
  });

  it("notifies subscribers only when their selected slice changes", () => {
    const store = new StateStore<TestState>({ count: 0, label: "start" });
    const countListener = vi.fn();
    const labelListener = vi.fn();

    store.subscribe((s) => s.count, countListener);
    store.subscribe((s) => s.label, labelListener);

    store.setState({ count: 1 });

    expect(countListener).toHaveBeenCalledWith(1, 0);
    expect(labelListener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const store = new StateStore<TestState>({ count: 0, label: "start" });
    const listener = vi.fn();
    const unsubscribe = store.subscribe((s) => s.count, listener);

    unsubscribe();
    store.setState({ count: 1 });

    expect(listener).not.toHaveBeenCalled();
  });
});
