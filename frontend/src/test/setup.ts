import "@testing-library/jest-dom/vitest";

// These are browser-only shims. Node-environment tests (e.g. the bundle-split
// build check, which runs Vite programmatically) share this global setup file
// but have no `window`; guard so they don't crash on load.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();

  global.fetch = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
});
