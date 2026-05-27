import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.ts"],
    testTimeout: 90000,
    hookTimeout: 150000,
    fileParallelism: false,
    maxConcurrency: 1,
    pool: "forks",
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      NODE_ENV: "test",
      AUTH_MODE: "local",
    },
  },
});
