import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/errorHandler", () => ({
  asyncHandler: (fn: any) => (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  },
}));

const makeApp = async () => {
  vi.resetModules();
  const { registerAiRoutes } = await import("./ai");
  const app = express();
  app.use(express.json());
  registerAiRoutes(app);
  return app;
};

const makeOkFetchResponse = (content: string) => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => ({
    choices: [{ message: { content } }],
  }),
});

describe("AI routes", () => {
  const originalApiKey = process.env.AI_API_KEY;
  const originalBaseUrl = process.env.AI_BASE_URL;

  beforeEach(() => {
    process.env.AI_API_KEY = "test-key";
    delete process.env.AI_BASE_URL;
  });

  afterEach(() => {
    process.env.AI_API_KEY = originalApiKey;
    process.env.AI_BASE_URL = originalBaseUrl;
    vi.restoreAllMocks();
  });

  it("returns 503 when AI_API_KEY is not set", async () => {
    delete process.env.AI_API_KEY;
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "a diagram" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("AI feature is not configured");
  });

  it("returns 400 when prompt is missing", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("prompt is required");
  });

  it("returns 400 when prompt is blank", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("prompt is required");
  });

  it("returns 502 when upstream responds with an error status", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal error",
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "a diagram" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("AI service returned an error");
  });

  it("returns 504 when fetch times out (AbortError)", async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "a diagram" });
    expect(res.status).toBe(504);
    expect(res.body.error).toBe("AI service timed out");
  });

  it("returns 502 when fetch rejects with a non-abort error", async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "a diagram" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("AI service is unreachable");
  });

  it("returns the generated diagram on success", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      makeOkFetchResponse("graph TD; A-->B"),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "a flowchart" });
    expect(res.status).toBe(200);
    expect(res.body.generatedResponse).toBe("graph TD; A-->B");
  });

  it("returns 502 when upstream returns an empty response", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(makeOkFetchResponse(""));
    const app = await makeApp();
    const res = await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "a diagram" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("AI service returned an empty response");
  });

  it("trims whitespace from AI_BASE_URL before building the request URL", async () => {
    process.env.AI_BASE_URL = "  https://custom.ai/v1  ";
    const fetchMock = vi.fn().mockResolvedValue(makeOkFetchResponse("A-->B"));
    (globalThis as any).fetch = fetchMock;
    const app = await makeApp();
    await request(app)
      .post("/ai/text-to-diagram/generate")
      .send({ prompt: "test" });
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe("https://custom.ai/v1/chat/completions");
  });
});
