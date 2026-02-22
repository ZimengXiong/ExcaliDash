import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getUpdateCheck } from "./api-helpers";

When("I check for stable updates", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const result = await getUpdateCheck(this.request, "stable");
  this.scenarioData.updateResult = result;
});

When("I check for pre-release updates", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const result = await getUpdateCheck(this.request, "prerelease");
  this.scenarioData.updateResult = result;
});

Then("the update response should contain the current version", async function (this: ExcaliDashWorld) {
  const result = this.scenarioData.updateResult as { currentVersion: string };
  expect(result.currentVersion).toBeDefined();
  expect(result.currentVersion.length).toBeGreaterThan(0);
});

Then("the update response should indicate the stable channel", async function (this: ExcaliDashWorld) {
  const result = this.scenarioData.updateResult as { channel: string };
  expect(result.channel).toBe("stable");
});

Then("the update response should indicate the prerelease channel", async function (this: ExcaliDashWorld) {
  const result = this.scenarioData.updateResult as { channel: string };
  expect(result.channel).toBe("prerelease");
});

Then("the update response should report outbound enabled status", async function (this: ExcaliDashWorld) {
  const result = this.scenarioData.updateResult as { outboundEnabled: boolean };
  expect(typeof result.outboundEnabled).toBe("boolean");
});
