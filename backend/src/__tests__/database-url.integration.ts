import path from "path";
import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "../config/databaseUrl";

const backendRoot = path.resolve(__dirname, "../../");

describe("resolveDatabaseUrl", () => {
  it("falls back to prisma/dev.db", () => {
    expect(resolveDatabaseUrl(undefined)).toBe(
      `file:${path.join(backendRoot, "prisma/dev.db")}`,
    );
  });

  it("resolves relative sqlite paths against the backend", () => {
    expect(resolveDatabaseUrl("file:./dev.db")).toBe(
      `file:${path.join(backendRoot, "prisma/dev.db")}`,
    );
    expect(resolveDatabaseUrl("file:./prisma/dev.db")).toBe(
      `file:${path.join(backendRoot, "prisma/dev.db")}`,
    );
  });

  it("leaves absolute and non-sqlite urls alone", () => {
    expect(resolveDatabaseUrl("file:/app/prisma/dev.db")).toBe(
      "file:/app/prisma/dev.db",
    );
    expect(resolveDatabaseUrl("postgresql://u:p@db:5432/x")).toBe(
      "postgresql://u:p@db:5432/x",
    );
  });
});
