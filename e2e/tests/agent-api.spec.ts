import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
  getDrawing,
} from "./helpers/api";

const TEST_EMAIL = "agent-e2e@example.test";
const TEST_PASSWORD = "Agent-E2E-Password-123!";

const login = async (
  request: import("@playwright/test").APIRequestContext,
) => {
  const response = await request.post(`${API_URL}/auth/login`, {
    headers: {
      "Content-Type": "application/json",
      ...(await getCsrfHeaders(request)),
    },
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(response.ok()).toBe(true);
};

type AgentTokenResponse = {
  agentToken: { id: string; name: string; prefix: string };
  token: string;
};

const createAgentToken = async (
  request: import("@playwright/test").APIRequestContext,
  drawingId: string,
): Promise<AgentTokenResponse> => {
  const response = await request.post(
    `${API_URL}/drawings/${drawingId}/agent-tokens`,
    {
      headers: {
        "Content-Type": "application/json",
        ...(await getCsrfHeaders(request)),
      },
      data: { name: "Playwright agent" },
    },
  );
  expect(response.status()).toBe(201);
  return (await response.json()) as AgentTokenResponse;
};

test.describe("Drawing agent API", () => {
  test.skip(
    process.env.E2E_AGENT_AUTH !== "true",
    "Run with E2E_AGENT_AUTH=true to enable the authenticated fixture.",
  );

  const drawingIds: string[] = [];

  test.beforeEach(async ({ request }) => {
    await login(request);
  });

  test.afterEach(async ({ request }) => {
    for (const id of drawingIds.splice(0)) {
      await deleteDrawing(request, id).catch(() => undefined);
    }
  });

  test("applies semantic operations and exposes structural reads", async ({
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Agent_API_${Date.now()}`,
    });
    drawingIds.push(drawing.id);
    const issued = await createAgentToken(request, drawing.id);
    const agent = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${issued.token}` },
    });

    try {
      const applyResponse = await agent.post(
        `${API_URL}/drawings/${drawing.id}/ops`,
        {
          data: {
            clientBatchId: "playwright-happy-path",
            ops: [
              {
                op: "add_shape",
                shape: "rectangle",
                x: 80,
                y: 100,
                label: "Agent-created service",
              },
            ],
          },
        },
      );
      expect(applyResponse.ok()).toBe(true);
      const applied = (await applyResponse.json()) as {
        version: number;
        results: Array<{ createdIds: string[] }>;
      };
      expect(applied.version).toBe((drawing.version ?? 0) + 1);
      expect(applied.results[0].createdIds).toHaveLength(2);

      const summaryResponse = await agent.get(
        `${API_URL}/drawings/${drawing.id}/summary`,
      );
      expect(summaryResponse.ok()).toBe(true);
      await expect(summaryResponse.text()).resolves.toContain(
        "Agent-created service",
      );

      const elementResponse = await agent.get(
        `${API_URL}/drawings/${drawing.id}/elements/${applied.results[0].createdIds[0]}`,
      );
      expect(elementResponse.ok()).toBe(true);
      expect(await elementResponse.json()).toMatchObject({
        element: { type: "rectangle" },
      });

      const stored = await getDrawing(request, drawing.id);
      expect(stored.version).toBe(applied.version);
      expect(stored.elements).toHaveLength(2);
    } finally {
      await agent.dispose();
    }
  });

  test("confines a token to one drawing and the agent routes", async ({
    request,
  }) => {
    const allowed = await createDrawing(request, { name: "Agent token scope" });
    const unrelated = await createDrawing(request, { name: "Unrelated drawing" });
    drawingIds.push(allowed.id, unrelated.id);
    const issued = await createAgentToken(request, allowed.id);
    const agent = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${issued.token}` },
    });

    try {
      expect(
        (await agent.get(`${API_URL}/drawings/${allowed.id}/summary`)).status(),
      ).toBe(200);
      expect(
        (await agent.get(`${API_URL}/drawings/${unrelated.id}/summary`)).status(),
      ).toBe(403);
      expect((await agent.get(`${API_URL}/drawings`)).status()).toBe(403);
      expect(
        (
          await agent.get(
            `${API_URL}/drawings/${allowed.id}/agent-tokens`,
          )
        ).status(),
      ).toBe(403);
    } finally {
      await agent.dispose();
    }
  });

  test("rolls back an invalid batch and rejects a revoked token", async ({
    request,
  }) => {
    const drawing = await createDrawing(request, { name: "Agent rollback" });
    drawingIds.push(drawing.id);
    const issued = await createAgentToken(request, drawing.id);
    const agent = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${issued.token}` },
    });

    try {
      const invalidResponse = await agent.post(
        `${API_URL}/drawings/${drawing.id}/ops`,
        {
          data: {
            ops: [
              { op: "add_shape", shape: "ellipse", x: 0, y: 0 },
              {
                op: "set_style",
                id: "missing-element",
                style: { strokeColor: "#ff0000" },
              },
            ],
          },
        },
      );
      expect(invalidResponse.status()).toBe(422);
      const unchanged = await getDrawing(request, drawing.id);
      expect(unchanged.version).toBe(drawing.version);
      expect(unchanged.elements).toEqual([]);

      const revokeResponse = await request.delete(
        `${API_URL}/drawings/${drawing.id}/agent-tokens/${issued.agentToken.id}`,
        { headers: await getCsrfHeaders(request) },
      );
      expect(revokeResponse.ok()).toBe(true);
      expect(
        (await agent.get(`${API_URL}/drawings/${drawing.id}/summary`)).status(),
      ).toBe(401);
    } finally {
      await agent.dispose();
    }
  });

  test("renders an external agent batch in an open editor without a reload", async ({
    page,
    request,
  }) => {
    const drawing = await createDrawing(request, { name: "Agent live update" });
    drawingIds.push(drawing.id);
    const issued = await createAgentToken(request, drawing.id);
    await login(page.request);
    await page.goto(`/editor/${drawing.id}`);
    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const before = await canvas.screenshot();

    const agent = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${issued.token}` },
    });
    try {
      const response = await agent.post(`${API_URL}/drawings/${drawing.id}/ops`, {
        data: {
          ops: [
            {
              op: "add_shape",
              shape: "rectangle",
              x: 240,
              y: 220,
              w: 260,
              h: 120,
              label: "Live agent update",
              style: { backgroundColor: "#a5d8ff", fillStyle: "solid" },
            },
          ],
        },
      });
      expect(response.ok()).toBe(true);

      await expect
        .poll(
          async () => !(await canvas.screenshot()).equals(before),
          { timeout: 10_000, message: "The open canvas did not render the agent batch" },
        )
        .toBe(true);
      expect(page.url()).toContain(`/editor/${drawing.id}`);
    } finally {
      await agent.dispose();
    }
  });
});
