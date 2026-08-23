import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const loadConfig = async () => {
  vi.resetModules();
  return import("./config");
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("storage config fail-fast", () => {
  it("rejects S3-adjacent vars set without S3_BUCKET", async () => {
    delete process.env.S3_BUCKET;
    process.env.S3_ENDPOINT = "https://minio.local";

    await expect(loadConfig()).rejects.toThrow(
      "S3 is half-configured: S3_ENDPOINT set without S3_BUCKET",
    );
  });

  it("rejects AWS credentials set without S3_BUCKET", async () => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ENDPOINT;
    process.env.AWS_ACCESS_KEY_ID = "AKIA";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";

    await expect(loadConfig()).rejects.toThrow(/half-configured/);
  });

  it("rejects a non-default S3_KEY_PREFIX without S3_BUCKET", async () => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ENDPOINT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    process.env.S3_KEY_PREFIX = "custom-prefix";

    await expect(loadConfig()).rejects.toThrow(/S3_KEY_PREFIX/);
  });

  it("allows the default database storage with no S3 vars", async () => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.S3_KEY_PREFIX;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    const { config } = await loadConfig();
    expect(config.s3.bucket).toBeNull();
  });

  it("allows a fully configured S3 bucket", async () => {
    process.env.S3_BUCKET = "my-bucket";
    process.env.S3_ENDPOINT = "https://minio.local";

    const { config } = await loadConfig();
    expect(config.s3.bucket).toBe("my-bucket");
  });

  it("rejects a non-positive FILE_UPLOAD_MAX_MB", async () => {
    delete process.env.S3_BUCKET;
    process.env.FILE_UPLOAD_MAX_MB = "0";

    await expect(loadConfig()).rejects.toThrow(
      "Invalid FILE_UPLOAD_MAX_MB: expected a positive number of megabytes",
    );
  });

  it("rejects a non-numeric FILE_UPLOAD_MAX_MB", async () => {
    delete process.env.S3_BUCKET;
    process.env.FILE_UPLOAD_MAX_MB = "abc";

    await expect(loadConfig()).rejects.toThrow(/FILE_UPLOAD_MAX_MB/);
  });
});
