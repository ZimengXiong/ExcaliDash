import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "file:./prisma/test.db",
      NODE_ENV: "test",
      AUTH_MODE: "local",
    },
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
