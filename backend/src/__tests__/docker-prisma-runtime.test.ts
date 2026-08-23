import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = path.resolve(__dirname, "../..");

describe("Docker Prisma client startup", () => {
  const dockerfile = fs.readFileSync(path.join(backendRoot, "Dockerfile"), "utf8");
  const entrypoint = fs.readFileSync(
    path.join(backendRoot, "docker-entrypoint.sh"),
    "utf8"
  );

  it("builds clients for every supported database provider", () => {
    expect(dockerfile).toContain("/app/prisma_clients/sqlite");
    expect(dockerfile).toContain("/app/prisma_clients/postgresql");
    expect(dockerfile).toContain(
      "COPY --from=builder /app/prisma_clients ./prisma_clients"
    );
  });

  it("selects a prebuilt client without generating one at runtime", () => {
    expect(entrypoint).toContain(
      'PRISMA_CLIENT_SOURCE="/app/prisma_clients/${DATABASE_PROVIDER}"'
    );
    expect(entrypoint).toContain(
      'cp -R "${PRISMA_CLIENT_SOURCE}/." /app/dist/generated/'
    );
    expect(entrypoint).not.toMatch(/npx\s+prisma\s+generate/);
  });
});
