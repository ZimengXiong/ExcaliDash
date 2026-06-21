import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { getCurrentLatestPrismaMigrationName } from "../routes/importExport/shared";

const providerPrisma = require("../../scripts/provider-prisma.cjs") as {
  inferProvider: (env?: Record<string, string | undefined>) => string;
  normalizeDatabaseUrl: (rawUrl?: string) => string;
  rewriteSchemaProvider: (schema: string, provider: string) => string;
};

describe("provider Prisma helpers", () => {
  it("prefers an explicit valid DATABASE_PROVIDER over DATABASE_URL inference", () => {
    expect(
      providerPrisma.inferProvider({
        DATABASE_PROVIDER: "sqlite",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/excalidash",
      })
    ).toBe("sqlite");

    expect(
      providerPrisma.inferProvider({
        DATABASE_PROVIDER: "postgresql",
        DATABASE_URL: "file:./dev.db",
      })
    ).toBe("postgresql");
  });

  it("infers provider conservatively from DATABASE_URL when DATABASE_PROVIDER is unset", () => {
    expect(
      providerPrisma.inferProvider({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/excalidash",
      })
    ).toBe("postgresql");
    expect(
      providerPrisma.inferProvider({
        DATABASE_URL: "postgres://user:pass@localhost:5432/excalidash",
      })
    ).toBe("postgresql");
    expect(providerPrisma.inferProvider({ DATABASE_URL: "file:./dev.db" })).toBe("sqlite");
    expect(providerPrisma.inferProvider({})).toBe("sqlite");
  });

  it("rejects unsupported DATABASE_PROVIDER values before invoking Prisma", () => {
    expect(() =>
      providerPrisma.inferProvider({
        DATABASE_PROVIDER: "mysql",
        DATABASE_URL: "mysql://localhost/excalidash",
      })
    ).toThrow(/DATABASE_PROVIDER must be 'sqlite' or 'postgresql'/);
  });

  it("normalizes relative sqlite file URLs into backend/prisma paths", () => {
    const backendRoot = path.resolve(__dirname, "../..");

    expect(providerPrisma.normalizeDatabaseUrl("file:./dev.db")).toBe(
      `file:${path.join(backendRoot, "prisma/dev.db")}`
    );
    expect(providerPrisma.normalizeDatabaseUrl("file:./prisma/dev.db")).toBe(
      `file:${path.join(backendRoot, "prisma/dev.db")}`
    );
  });

  it("rewrites only the datasource provider and leaves generator providers untouched", () => {
    const schema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = env("DATABASE_PROVIDER")
  url      = env("DATABASE_URL")
}
`;

    const rewritten = providerPrisma.rewriteSchemaProvider(schema, "postgresql");

    expect(rewritten).toContain('generator client {\n  provider = "prisma-client-js"');
    expect(rewritten).toContain('datasource db {\n  provider = "postgresql"');
    expect(rewritten).not.toContain('provider = env("DATABASE_PROVIDER")');
  });
});

describe("current Prisma migration discovery", () => {
  it("returns the latest concrete sqlite migration when provider folders are present", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-migrations-"));
    try {
      const migrationsRoot = path.join(root, "prisma/migrations");
      fs.mkdirSync(path.join(migrationsRoot, "sqlite/20240101000000_initial"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(migrationsRoot, "sqlite/20240201000000_add_drawings"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(migrationsRoot, "postgresql/20240301000000_pg_only"), {
        recursive: true,
      });

      await expect(getCurrentLatestPrismaMigrationName(root)).resolves.toBe(
        "20240201000000_add_drawings"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores provider directory names when falling back to flat migrations", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-flat-migrations-"));
    try {
      const migrationsRoot = path.join(root, "prisma/migrations");
      fs.mkdirSync(path.join(migrationsRoot, "postgresql"), { recursive: true });
      fs.mkdirSync(path.join(migrationsRoot, "sqlite"), { recursive: true });
      fs.mkdirSync(path.join(migrationsRoot, "20240401000000_flat_migration"), {
        recursive: true,
      });

      await expect(getCurrentLatestPrismaMigrationName(root)).resolves.toBe(
        "20240401000000_flat_migration"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
