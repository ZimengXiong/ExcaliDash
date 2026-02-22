import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";

When("I check the health endpoint", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const apiUrl = process.env.API_URL || this.apiUrl;
  this.scenarioData.healthResponse = await this.request.get(`${apiUrl}/health`);
});

Then("the service should report healthy", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.healthResponse as Awaited<ReturnType<NonNullable<ExcaliDashWorld["request"]>["get"]>>;
  const status = response.status();
  const body = await response.text();
  if (!response.ok()) {
    console.error(`Health check failed: ${status} ${body}`);
  }
  expect(response.ok()).toBe(true);
});
