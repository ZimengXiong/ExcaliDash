import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KimiClientError,
  requestKimiBoardResponse,
  streamKimiBoardResponse,
} from "../ai/kimi";

const settings = {
  apiKey: "secret",
  baseUrl: "https://api.moonshot.ai/v1",
  model: "kimi-k3.1-pro",
  reasoningEffort: "high" as const,
  timeoutMs: 180000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kimi board client", () => {
  it("uses K3.1 Pro high effort and parses structured content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ message: "Done", operations: [] }),
                reasoning_content: "private reasoning",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestKimiBoardResponse(
      settings,
      [],
      { elements: [] },
      "Hello",
    );

    expect(result).toEqual({ message: "Done", operations: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.moonshot.ai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("kimi-k3.1-pro");
    expect(body.reasoning_effort).toBe("high");
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "board_ai_response",
        strict: true,
      },
    });
    expect(
      body.response_format.json_schema.schema.properties.operations,
    ).toBeDefined();
    expect(body.temperature).toBeUndefined();
  });

  it("streams reasoning separately from the structured response", async () => {
    const responseText = JSON.stringify({ message: "Done", operations: [] });
    const events = [
      { reasoning_content: "I should " },
      { reasoning_content: "respond.", content: responseText.slice(0, 20) },
      { content: responseText.slice(20) },
    ];
    const body =
      events
        .map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`)
        .join("") + "data: [DONE]\n\n";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onReasoning = vi.fn();

    const result = await streamKimiBoardResponse(
      settings,
      [],
      { elements: [] },
      "Hello",
      onReasoning,
    );

    expect(result).toEqual({ message: "Done", operations: [] });
    expect(onReasoning.mock.calls.map(([text]) => text).join("")).toBe(
      "I should respond.",
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.stream).toBe(true);
    expect(requestBody.stream_options).toEqual({ include_usage: true });
  });

  it("rejects malformed board operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    message: "Bad",
                    operations: [
                      { type: "delete", elementId: "x", extra: true },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      requestKimiBoardResponse(settings, [], { elements: [] }, "Delete"),
    ).rejects.toBeInstanceOf(KimiClientError);
  });
});
