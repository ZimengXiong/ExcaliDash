import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "excalidash-oidc-secret-"),
);
const file = path.join(directory, "client-secret");
const secret = "test-only-oidc-secret";
fs.writeFileSync(file, `${secret}\r\n`, { mode: 0o600 });
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

const start = (extra: NodeJS.ProcessEnv) =>
  spawnSync(
    process.execPath,
    [
      "-r",
      "ts-node/register/transpile-only",
      "-e",
      "const {config}=require('./src/config');if(config.oidc.clientSecret!=='test-only-oidc-secret')process.exit(2);console.log('secret resolved')",
    ],
    {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
      timeout: 10000,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        AUTH_MODE: "hybrid",
        JWT_SECRET: "test-jwt-secret-with-at-least-thirty-two-characters",
        API_KEY_HASH_PEPPER: "oidc-test-pepper",
        OIDC_ISSUER_URL: "https://id.example.test",
        OIDC_CLIENT_ID: "test",
        OIDC_REDIRECT_URI: "https://app.example.test/auth/oidc/callback",
        OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG: "HS256",
        ...extra,
      },
    },
  );

describe("OIDC secret-file startup", () => {
  it("loads a mounted secret directly through the production Node configuration", () => {
    const result = start({ OIDC_CLIENT_SECRET_FILE: file });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("secret resolved");
    expect(result.stdout + result.stderr).not.toContain(secret);
  });
  it("keeps environment-secret startup compatible", () => {
    const result = start({ OIDC_CLIENT_SECRET: secret });
    expect(result.status, result.stderr).toBe(0);
  });
  it("fails closed on conflicting sources without logging either secret", () => {
    const result = start({
      OIDC_CLIENT_SECRET_FILE: file,
      OIDC_CLIENT_SECRET: "other-test-secret",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Use only one");
    expect(result.stderr).not.toContain("other-test-secret");
  });
  it("fails closed on missing or empty files", () => {
    const empty = path.join(directory, "empty");
    fs.writeFileSync(empty, "\r\n");
    for (const [filename, reason] of [
      [path.join(directory, "missing"), "not readable"],
      [empty, "empty"],
    ]) {
      const result = start({ OIDC_CLIENT_SECRET_FILE: filename });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`OIDC_CLIENT_SECRET_FILE is ${reason}`);
    }
  });
});
