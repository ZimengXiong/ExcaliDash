import { test, expect } from "@playwright/test";
import { API_URL } from "./helpers/api";

test("the e2e backend has enough CSRF and API budget for a full journey", async ({
  request,
}) => {
  // The default production budgets are intentionally smaller than this suite.
  // Validate the test-server overrides, not changes to production limits.
  for (let index = 0; index < 125; index++) {
    const csrf = await request.get(`${API_URL}/csrf-token`);
    expect(csrf.status(), `CSRF request ${index + 1}`).toBe(200);
    expect((await csrf.json()).token).toBeTruthy();
    const health = await request.get(`${API_URL}/health`);
    expect(health.status(), `API request ${index + 1}`).toBe(200);
  }
});
