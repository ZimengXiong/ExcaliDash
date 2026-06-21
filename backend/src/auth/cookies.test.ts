import type { Request, Response } from "express";
import ms, { type StringValue } from "ms";
import { describe, expect, it, vi } from "vitest";
import { config } from "../config";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  setAuthCookies,
} from "./cookies";

const createRequest = (): Request =>
  ({
    secure: false,
    headers: {},
    app: {
      get: vi.fn().mockReturnValue(false),
    },
  }) as unknown as Request;

const createResponse = (): Response =>
  ({
    cookie: vi.fn().mockReturnThis(),
  }) as unknown as Response;

describe("auth cookies", () => {
  it("keeps the access-token cookie aligned with the access-token lifetime", () => {
    const req = createRequest();
    const res = createResponse();

    setAuthCookies(req, res, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    expect(res.cookie).toHaveBeenCalledTimes(2);

    const accessCall = (res.cookie as any).mock.calls.find(
      (call: unknown[]) => call[0] === ACCESS_TOKEN_COOKIE_NAME
    );
    const refreshCall = (res.cookie as any).mock.calls.find(
      (call: unknown[]) => call[0] === REFRESH_TOKEN_COOKIE_NAME
    );

    expect(accessCall).toBeTruthy();
    expect(refreshCall).toBeTruthy();
    expect(accessCall[2].maxAge).toBe(ms(config.jwtAccessExpiresIn as StringValue));
    expect(refreshCall[2].maxAge).toBe(ms(config.jwtRefreshExpiresIn as StringValue));
    expect(accessCall[2].maxAge).not.toBe(refreshCall[2].maxAge);
  });
});
