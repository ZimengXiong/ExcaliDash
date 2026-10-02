import { test, expect } from "@playwright/test";

test("compression settings stay stable across navigation and reload", async ({
  page,
}) => {
  await page.goto("/settings");
  const toggle = page.getByRole("switch", {
    name: "Toggle image optimization",
  });
  const threshold = page.getByLabel("Image compression threshold in MB");
  await expect(toggle).toBeVisible();
  for (const checked of ["false", "true", "false", "true"]) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", checked);
  }
  await threshold.fill("1.5");
  await threshold.press("Enter");
  await expect(threshold).toHaveValue("1.5");
  await page.goto("/");
  await page.goto("/settings");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(threshold).toHaveValue("1.5");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(threshold).toHaveValue("1.5");
  await toggle.click();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(threshold).toBeDisabled();
});
