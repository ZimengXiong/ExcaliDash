import { describe, expect, it } from "vitest";
import {
  createHttpsRedirectPolicy,
  getHttpsRedirectUrl,
} from "./httpsRedirectPolicy";

const createRequest = (overrides?: {
  host?: string;
  path?: string;
  secure?: boolean;
  forwardedProto?: string;
}) =>
  ({
    secure: overrides?.secure ?? false,
    headers: {
      host: overrides?.host ?? "secure.example.com",
      ...(overrides?.forwardedProto
        ? { "x-forwarded-proto": overrides.forwardedProto }
        : {}),
    },
    originalUrl: overrides?.path ?? "/api/session?next=%2Fdashboard",
  }) as any;

describe("https redirect policy", () => {
  it("allows configured http aliases even when another frontend origin uses https", () => {
    const policy = createHttpsRedirectPolicy([
      "https://secure.example.com",
      "http://alias.internal",
    ]);
    const req = createRequest({
      host: "alias.internal",
      path: "/api/session",
    });

    expect(getHttpsRedirectUrl(req, policy)).toBeNull();
  });

  it("redirects configured https hosts back to their https origin", () => {
    const policy = createHttpsRedirectPolicy([
      "https://secure.example.com",
      "http://alias.internal",
    ]);
    const req = createRequest({
      host: "secure.example.com",
    });

    expect(getHttpsRedirectUrl(req, policy)).toBe(
      "https://secure.example.com/api/session?next=%2Fdashboard"
    );
  });

  it("falls back to the canonical https host for unknown hosts", () => {
    const policy = createHttpsRedirectPolicy([
      "https://secure.example.com",
      "http://alias.internal",
    ]);
    const req = createRequest({
      host: "unexpected.internal",
      path: "/login",
    });

    expect(getHttpsRedirectUrl(req, policy)).toBe(
      "https://secure.example.com/login"
    );
  });

  it("does not redirect when forwarded proto is already https", () => {
    const policy = createHttpsRedirectPolicy(["https://secure.example.com"]);
    const req = createRequest({
      host: "secure.example.com",
      forwardedProto: "https",
    });

    expect(getHttpsRedirectUrl(req, policy)).toBeNull();
  });
});
