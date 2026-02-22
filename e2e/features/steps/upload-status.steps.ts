import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";

When("I wait for uploads to finish", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const uploadToggle = this.page.locator("button").filter({ hasText: /^Uploads \(/i }).first();
  const uploadIndicator = this.page.getByText(/Uploads \(Done\)|Uploads \([0-9]+\s+active\)/i).first();

  const hasToggle = await uploadToggle.isVisible().catch(() => false);
  if (hasToggle) {
    await uploadToggle.click();
    const indicatorVisible = await uploadIndicator.isVisible().catch(() => false);
    if (indicatorVisible) {
      await expect(uploadIndicator).toBeVisible({ timeout: 20000 });
    }
  } else {
    const uploadHeader = this.page.getByRole("heading", { name: /Uploads \(/i });
    const headerVisible = await uploadHeader.isVisible().catch(() => false);
    if (headerVisible) {
      await expect(uploadHeader).toHaveText(/Uploads \(Done\)/i, { timeout: 20000 });
    }
  }
});
