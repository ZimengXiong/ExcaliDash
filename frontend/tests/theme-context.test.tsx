import React, { useLayoutEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import {
  PreferencesProvider,
  usePreferences,
} from "../src/context/PreferencesContext";
import { useAuth } from "../src/context/AuthContext";
import {
  getUserPreferences,
  updateUserPreferences,
  type ThemePreference,
} from "../src/api";

vi.mock("../src/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../src/api", () => ({
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

// Stateful stand-in for the server-backed preference so the provider can be
// exercised without the auth/preferences stack.
const { preferenceStub } = vi.hoisted(() => ({
  preferenceStub: {
    initial: undefined as ThemePreference | undefined,
    writes: [] as Array<ThemePreference | undefined>,
  },
}));
vi.mock("../src/context/PreferencesContext", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/context/PreferencesContext")
  >()),
  usePreference: (_key: string, fallback: ThemePreference) => {
    const [value, setValue] = useState<ThemePreference | undefined>(
      preferenceStub.initial,
    );
    return [
      value ?? fallback,
      (next: ThemePreference | undefined) => {
        preferenceStub.writes.push(next);
        setValue(next);
      },
    ] as const;
  },
}));

type MediaQueryStub = EventTarget & { matches: boolean; media: string };

let darkScheme: MediaQueryStub;
let htmlClasses: Set<string>;
let favicon: { href: string };
let latest: ReturnType<typeof useTheme>;
const renderers: ReactTestRenderer[] = [];

const Probe = () => {
  const value = useTheme();
  useLayoutEffect(() => {
    latest = value;
  });
  return null;
};

const renderProvider = async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
  renderers.push(renderer);
  return renderer;
};

const setSystemDark = async (dark: boolean) => {
  darkScheme.matches = dark;
  await act(async () => {
    darkScheme.dispatchEvent(new Event("change"));
  });
};

beforeEach(() => {
  preferenceStub.initial = undefined;
  preferenceStub.writes = [];
  darkScheme = Object.assign(new EventTarget(), {
    matches: false,
    media: "(prefers-color-scheme: dark)",
  });
  htmlClasses = new Set();
  favicon = { href: "/favicon.svg" };
  vi.stubGlobal("window", {
    matchMedia: vi.fn((query: string) => {
      expect(query).toBe("(prefers-color-scheme: dark)");
      return darkScheme;
    }),
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        add: (name: string) => htmlClasses.add(name),
        remove: (name: string) => htmlClasses.delete(name),
      },
    },
    querySelector: (selector: string) =>
      selector.includes("icon") ? favicon : null,
  });
});

afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach((renderer) => renderer.unmount());
  });
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("follows the OS color scheme when no theme is stored", async () => {
    darkScheme.matches = true;
    await renderProvider();

    expect(latest.themePreference).toBe("system");
    expect(latest.theme).toBe("dark");
    expect(htmlClasses.has("dark")).toBe(true);
    expect(favicon.href).toBe("/favicon-dark.svg");

    await setSystemDark(false);
    expect(latest.theme).toBe("light");
    expect(htmlClasses.has("dark")).toBe(false);
    expect(favicon.href).toBe("/favicon-light.svg");
    // Reacting to the OS must not be written back as an explicit choice.
    expect(preferenceStub.writes).toEqual([]);
  });

  it("keeps an explicit choice regardless of the OS color scheme", async () => {
    preferenceStub.initial = "dark";
    await renderProvider();

    expect(latest.theme).toBe("dark");
    expect(htmlClasses.has("dark")).toBe(true);

    await setSystemDark(false);
    expect(latest.theme).toBe("dark");
    expect(htmlClasses.has("dark")).toBe(true);
  });

  it("toggles to the opposite of the resolved theme and stores it explicitly", async () => {
    darkScheme.matches = true;
    await renderProvider();
    expect(latest.theme).toBe("dark");

    await act(async () => {
      latest.toggleTheme();
    });

    expect(preferenceStub.writes).toEqual(["light"]);
    expect(latest.themePreference).toBe("light");
    expect(latest.theme).toBe("light");
    expect(htmlClasses.has("dark")).toBe(false);

    // Once explicit, OS changes no longer apply.
    await setSystemDark(false);
    await setSystemDark(true);
    expect(latest.theme).toBe("light");
  });

  it("returns to following the OS when the preference is set back to system", async () => {
    preferenceStub.initial = "light";
    darkScheme.matches = true;
    await renderProvider();
    expect(latest.theme).toBe("light");

    await act(async () => {
      latest.setThemePreference("system");
    });

    expect(preferenceStub.writes).toEqual(["system"]);
    expect(latest.theme).toBe("dark");
    expect(htmlClasses.has("dark")).toBe(true);
  });

  it("stops listening to the OS after unmount", async () => {
    const renderer = await renderProvider();
    const removeSpy = vi.spyOn(darkScheme, "removeEventListener");

    await act(async () => {
      renderer.unmount();
    });
    renderers.length = 0;

    expect(removeSpy).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

describe("PreferencesProvider", () => {
  let values: ReturnType<typeof usePreferences>;
  const storageKey = "excalidash-preferences";
  const useSession = (id: string | undefined, authEnabled: boolean) => {
    vi.mocked(useAuth).mockReturnValue({
      user: id ? { id } : null,
      authEnabled,
    } as ReturnType<typeof useAuth>);
  };
  const PreferencesProbe = () => {
    const current = usePreferences();
    useLayoutEffect(() => {
      values = current;
    }, [current]);
    return null;
  };
  const tree = () => (
    <PreferencesProvider>
      <PreferencesProbe />
    </PreferencesProvider>
  );
  const render = async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(tree());
    });
    renderers.push(renderer);
    return renderer;
  };

  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.mocked(getUserPreferences).mockReset();
    vi.mocked(updateUserPreferences).mockReset().mockResolvedValue({});
  });

  it("resets unset keys when switching accounts, even with cached values", async () => {
    localStorage.setItem(storageKey, JSON.stringify({ compactSidebar: false }));
    localStorage.setItem(
      `${storageKey}:second`,
      JSON.stringify({ appendDroppedDrawings: true }),
    );
    useSession("first", true);
    vi.mocked(getUserPreferences).mockResolvedValueOnce({
      appendDroppedDrawings: true,
      theme: "dark",
    });
    const renderer = await render();
    expect(values.preferences).toEqual({
      appendDroppedDrawings: true,
      theme: "dark",
    });

    useSession("second", true);
    vi.mocked(getUserPreferences).mockResolvedValueOnce({});
    await act(async () => {
      renderer.update(tree());
    });
    expect(values.preferences).toEqual({});
    expect(localStorage.getItem(`${storageKey}:second`)).toBe("{}");
    expect(updateUserPreferences).not.toHaveBeenCalled();
  });

  it("saves a single-user preference edited while server preferences load", async () => {
    useSession(undefined, false);
    let finish!: (value: { appendDroppedDrawings: boolean }) => void;
    vi.mocked(getUserPreferences).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    localStorage.setItem(storageKey, JSON.stringify({ theme: "dark" }));
    await render();

    await act(async () => {
      values.setPreference("appendDroppedDrawings", true);
    });
    expect(updateUserPreferences).not.toHaveBeenCalled();
    await act(async () => {
      finish({ appendDroppedDrawings: false });
    });
    expect(values.preferences).toEqual({
      appendDroppedDrawings: true,
      theme: "dark",
    });
    expect(updateUserPreferences).toHaveBeenCalledWith({
      appendDroppedDrawings: true,
    });
  });
});
