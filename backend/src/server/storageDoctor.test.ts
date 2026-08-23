import { describe, expect, it, vi } from "vitest";
import {
  buildStorageSummary,
  parseDatabaseTarget,
  runStorageDoctor,
  type StorageDoctorConfig,
} from "./storageDoctor";

const baseConfig = (overrides: Partial<StorageDoctorConfig> = {}): StorageDoctorConfig => ({
  databaseUrl: "file:/var/lib/excalidash/prisma/dev.db",
  fileUploadMaxMb: 100,
  bodyLimitMb: 50,
  backups: { schedule: null },
  s3: {
    bucket: null,
    region: "us-east-1",
    endpoint: null,
    publicUrl: null,
    forcePathStyle: false,
  },
  ...overrides,
});

const s3Config = (overrides: Partial<StorageDoctorConfig["s3"]> = {}) => ({
  bucket: "my-bucket",
  region: "eu-west-1",
  endpoint: null,
  publicUrl: null,
  forcePathStyle: false,
  ...overrides,
});

describe("parseDatabaseTarget", () => {
  it("returns the file path for sqlite without credentials", () => {
    expect(parseDatabaseTarget("file:/data/dev.db")).toEqual({
      provider: "sqlite",
      target: "/data/dev.db",
    });
  });

  it("strips credentials from a postgres url", () => {
    const parsed = parseDatabaseTarget(
      "postgresql://admin:s3cret@db.internal:5432/excalidash",
    );
    expect(parsed.provider).toBe("postgresql");
    expect(parsed.target).toBe("db.internal:5432/excalidash");
    expect(parsed.target).not.toContain("s3cret");
    expect(parsed.target).not.toContain("admin");
  });

  it("handles an unset url", () => {
    expect(parseDatabaseTarget(undefined)).toEqual({
      provider: "unknown",
      target: "<unset>",
    });
  });
});

describe("buildStorageSummary", () => {
  it("renders sqlite + database storage when S3 is disabled", () => {
    const lines = buildStorageSummary({ config: baseConfig(), s3Enabled: false });
    const text = lines.join("\n");
    expect(text).toContain("Database:      sqlite (/var/lib/excalidash/prisma/dev.db)");
    expect(text).toContain("File storage:  database (default)");
    expect(text).toContain("FILE_UPLOAD_MAX_MB=100");
    expect(text).toContain("BODY_LIMIT_MB=50");
    expect(text).toContain("Backups:       off");
    expect(text).not.toContain("Bucket:");
  });

  it("renders postgres + reachable S3", () => {
    const lines = buildStorageSummary({
      config: baseConfig({
        databaseUrl: "postgresql://u:p@pg:5432/app",
        backups: { schedule: "0 3 * * *" },
        s3: s3Config({ endpoint: "https://minio.local", publicUrl: "https://cdn.example.com", forcePathStyle: true }),
      }),
      s3Enabled: true,
      probe: { ok: true },
    });
    const text = lines.join("\n");
    expect(text).toContain("Database:      postgresql (pg:5432/app)");
    expect(text).toContain("File storage:  s3");
    expect(text).toContain("Bucket:      my-bucket");
    expect(text).toContain("Region:      eu-west-1");
    expect(text).toContain("Endpoint:    https://minio.local");
    expect(text).toContain("Public URL:  https://cdn.example.com");
    expect(text).toContain("Path style:  on");
    expect(text).toContain("Reachable:   yes (HeadBucket ok)");
    expect(text).toContain("Backups:       on (0 3 * * *)");
    expect(text).not.toMatch(/WARNING/);
  });

  it("emits an actionable WARNING when the bucket is unreachable", () => {
    const lines = buildStorageSummary({
      config: baseConfig({ s3: s3Config() }),
      s3Enabled: true,
      probe: { ok: false, error: "timed out after 3000ms" },
    });
    const text = lines.join("\n");
    expect(text).toContain("Reachable:   NO");
    expect(text).toContain("could not reach bucket 'my-bucket': timed out after 3000ms");
    expect(text).toContain("Likely a bad credential, endpoint, or missing bucket");
  });

  it("warns when a custom endpoint has no public URL", () => {
    const lines = buildStorageSummary({
      config: baseConfig({ s3: s3Config({ endpoint: "https://minio.local", publicUrl: null }) }),
      s3Enabled: true,
      probe: { ok: true },
    });
    const text = lines.join("\n");
    expect(text).toContain("custom S3_ENDPOINT set without S3_PUBLIC_URL");
    expect(text).toContain("Set S3_PUBLIC_URL");
  });
});

describe("runStorageDoctor", () => {
  it("skips the probe and prints the box when S3 is disabled", async () => {
    const log = vi.fn();
    const probeBucket = vi.fn();
    await runStorageDoctor({
      config: baseConfig(),
      isS3Enabled: () => false,
      probeBucket,
      logger: { log },
    });
    expect(probeBucket).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    const printed = log.mock.calls[0][0] as string;
    expect(printed).toContain("STORAGE");
    expect(printed).toContain("File storage:  database (default)");
  });

  it("probes and renders the result when S3 is enabled", async () => {
    const log = vi.fn();
    await runStorageDoctor({
      config: baseConfig({ s3: s3Config() }),
      isS3Enabled: () => true,
      probeBucket: async () => ({ ok: false, error: "AccessDenied" }),
      logger: { log },
    });
    const printed = log.mock.calls[0][0] as string;
    expect(printed).toContain("Reachable:   NO");
    expect(printed).toContain("AccessDenied");
  });

  it("never throws when the probe rejects", async () => {
    const log = vi.fn();
    await expect(
      runStorageDoctor({
        config: baseConfig({ s3: s3Config() }),
        isS3Enabled: () => true,
        probeBucket: async () => {
          throw new Error("network exploded");
        },
        logger: { log },
      }),
    ).resolves.toBeUndefined();
    const printed = log.mock.calls[0][0] as string;
    expect(printed).toContain("network exploded");
  });
});
