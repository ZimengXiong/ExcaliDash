import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { saveDrawingKeepalive } from "./keepaliveSave";

vi.mock("../../api", () => ({
  API_URL: "/api",
  getCsrfHeader: vi.fn(),
}));

describe("saveDrawingKeepalive (pagehide flush)", () => {
  const getCsrfHeader = vi.mocked(api.getCsrfHeader);
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(undefined as any);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues a keepalive PUT with credentials and the CSRF header", () => {
    getCsrfHeader.mockReturnValue({ name: "x-csrf-token", token: "tok123" });

    const ok = saveDrawingKeepalive("d1", { elements: [], version: 4 });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/drawings/d1");
    expect(init.method).toBe("PUT");
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe("include");
    expect(init.headers["x-csrf-token"]).toBe("tok123");
    expect(JSON.parse(init.body)).toEqual({ elements: [], version: 4 });
  });

  it("still sends (without a CSRF header) when no token is cached", () => {
    getCsrfHeader.mockReturnValue(null);

    const ok = saveDrawingKeepalive("d1", { elements: [] });

    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-csrf-token"]).toBeUndefined();
  });

  it("does nothing without a drawing id", () => {
    const ok = saveDrawingKeepalive("", { elements: [] });
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
