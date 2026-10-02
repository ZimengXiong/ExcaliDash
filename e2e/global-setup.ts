import { expect } from "@playwright/test";

export default async function globalSetup() {
  // Never turn authentication off on an existing installation. The managed test
  // server starts with AUTH_MODE=disabled and a dedicated database instead.
  const response = await fetch(`${process.env.API_URL}/auth/status`);
  expect(response.ok).toBe(true);
  expect((await response.json()).authEnabled).toBe(false);
}
