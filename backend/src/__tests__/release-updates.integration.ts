import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { setupTestDb } from "./testUtils";
import { startRuntimeServer } from "./runtimeServer";

describe("release update HTTP routes", () => {
  const version = fs
    .readFileSync(path.resolve(__dirname, "../../../VERSION"), "utf8")
    .trim();
  const current = `${version}-dev.1234567`;
  let app: any;
  let prisma: any;
  let resetCache: () => void;
  const release = (tag: string, published: string, prerelease = true) => ({
    tag_name: `v${tag}`,
    published_at: published,
    prerelease,
    draft: false,
    html_url: `https://github.com/ZimengXiong/ExcaliDash/releases/tag/v${tag}`,
  });
  const upstream = (payload: unknown, status = 200) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ETag: '"fixture"' },
      }),
    );

  beforeAll(async () => {
    setupTestDb();
    process.env.AUTH_MODE = "disabled";
    process.env.APP_BUILD_LABEL = current;
    process.env.UPDATE_CHECK_OUTBOUND = "true";
    ({ app } = await import("../index"));
    ({ prisma } = await import("../db/prisma"));
    ({ __resetUpdateCacheForTests: resetCache } =
      await import("../routes/system/update"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCache();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("queries the stable endpoint rather than a list crowded with dev releases", async () => {
    const fetch = upstream(release("0.6.4", "2026-10-02T12:00:00Z", false));
    const response = await request(app).get("/system/update?channel=stable");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currentVersion: current,
      latestVersion: "0.6.4",
      isUpdateAvailable: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/ZimengXiong/ExcaliDash/releases/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("selects dev builds by publication time, not the lexical order of their hashes", async () => {
    upstream([
      release(`${version}-dev.fffffff`, "2026-10-01T12:00:00Z"),
      release(`${version}-dev.0000000`, "2026-10-02T12:00:00Z"),
    ]);
    const response = await request(app).get(
      "/system/update?channel=prerelease",
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currentVersion: current,
      latestVersion: `${version}-dev.0000000`,
      isUpdateAvailable: true,
    });
  });

  it("does not advertise the installed dev build as an update", async () => {
    upstream([release(current, "2026-10-02T12:00:00Z")]);
    const response = await request(app).get(
      "/system/update?channel=prerelease",
    );
    expect(response.status).toBe(200);
    expect(response.body.isUpdateAvailable).toBe(false);
  });

  it("prefers the stable release over dev builds of that same version", async () => {
    upstream([
      release(version, "2026-10-01T12:00:00Z", false),
      release(`${version}-dev.fffffff`, "2026-10-02T12:00:00Z"),
    ]);
    const response = await request(app).get(
      "/system/update?channel=prerelease",
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      latestVersion: version,
      isUpdateAvailable: true,
    });
  });

  it("caches repeated checks without mixing stable and dev channels", async () => {
    const fetch = upstream(release(version, "2026-10-02T12:00:00Z", false));
    await request(app).get("/system/update?channel=stable").expect(200);
    await request(app).get("/system/update?channel=stable").expect(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify([release(current, "2026-10-02T12:00:00Z")])),
    );
    const response = await request(app).get(
      "/system/update?channel=prerelease",
    );
    expect(response.status).toBe(200);
    expect(response.body.latestVersion).toBe(current);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["", "0.9.9-dev.fffffff", "ci-1234567"])(
    "retains VERSION when the runtime build label is %j",
    async (label) => {
      const server = await startRuntimeServer({
        AUTH_MODE: "disabled",
        APP_BUILD_LABEL: label,
        ENFORCE_HTTPS_REDIRECT: "false",
      });
      try {
        const response = await fetch(`${server.url}/system/update`);
        expect(response.status).toBe(200);
        expect((await response.json()).currentVersion).toBe(version);
      } finally {
        await server.stop();
      }
    },
  );
});
