import { defineConfig } from "cypress";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import { createEsbuildPlugin } from "@badeball/cypress-cucumber-preprocessor/esbuild";
import { startServers, stopServers } from "./features/support/server-manager";
import { registerTasks } from "./cypress/task-runner";

export default defineConfig({
  e2e: {
    baseUrl: process.env.BASE_URL || "http://127.0.0.1:5173",
    specPattern: "features/**/*.feature",
    supportFile: "cypress/support/e2e.ts",
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 20000,
    pageLoadTimeout: 120000,
    setupNodeEvents: async (on, config) => {
      await startServers();
      if (process.env.BASE_URL) {
        config.baseUrl = process.env.BASE_URL;
      }
      if (process.env.API_URL) {
        config.env.apiUrl = process.env.API_URL;
      }
      on("after:run", async () => {
        await stopServers();
      });
      await addCucumberPreprocessorPlugin(on, config);
      on(
        "file:preprocessor",
        createBundler({
          plugins: [createEsbuildPlugin(config)],
        })
      );
      on("task", registerTasks());

      return config;
    },
    excludeSpecPattern: "**/node_modules/**",
    retries: process.env.CI ? 2 : 0,
    env: {
      apiUrl: process.env.API_URL || "http://127.0.0.1:8000",
      authEmail: process.env.AUTH_EMAIL || "admin@example.com",
      authUsername: process.env.AUTH_USERNAME || "admin",
      authPassword: process.env.AUTH_PASSWORD || "BddPassword!123",
      tags: process.env.TAGS || process.env.tags,
      filterSpecs: process.env.FILTER_SPECS === "true",
    },
  },
});
