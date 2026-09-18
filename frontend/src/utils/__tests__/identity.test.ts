import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getUserIdentity } from "../identity";
import { getInitialsFromName } from "../user";

describe("getUserIdentity", () => {
  const makeMemoryLocalStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
  };

  let originalLocalStorage: any;

  beforeEach(() => {
    // Our Vitest environment provides a minimal localStorage stub (no clear/removeItem).
    // Override with a standard in-memory implementation for these tests.
    originalLocalStorage = (globalThis as any).localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: makeMemoryLocalStorage(),
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it("normalizes stored initials to match the stored name", () => {
    localStorage.setItem(
      "excalidash-user-id",
      JSON.stringify({
        id: "device-1",
        name: "Scourge",
        initials: "LO",
        color: "#123456",
      }),
    );

    const identity = getUserIdentity();
    expect(identity).toEqual({
      id: "device-1",
      name: "Scourge",
      initials: "SC",
      color: "#123456",
    });
  });

  it("is deterministic from the browser fingerprint", () => {
    localStorage.setItem("excalidash-device-id", "device-abc");

    const first = getUserIdentity();
    expect(first.initials).toBe(getInitialsFromName(first.name));

    // Clearing only the user-id should not change the computed identity.
    localStorage.removeItem("excalidash-user-id");
    const second = getUserIdentity();

    expect(second).toEqual(first);
  });
});
