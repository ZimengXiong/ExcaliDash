import { describe, expect, it } from "vitest";
import {
  CodexStreamAccumulator,
  buildResponsesBody,
  normalizeCodexModel,
  toResponsesInput,
} from "./codexResponses";
import type { AgentTool } from "../toolDefs";
import type { ConversationTurn } from "./types";

const TOOLS: AgentTool[] = [
  {
    name: "apply_ops",
    description: "Apply ops",
    inputSchema: { type: "object", properties: {} },
  },
];

describe("normalizeCodexModel", () => {
  it("passes through known Codex slugs", () => {
    expect(normalizeCodexModel("gpt-5.1-codex", "gpt-5.1")).toBe("gpt-5.1-codex");
    expect(normalizeCodexModel("gpt-5.2", "gpt-5.1")).toBe("gpt-5.2");
  });

  it("strips a provider prefix", () => {
    expect(normalizeCodexModel("openai/gpt-5.2-codex", "gpt-5.1")).toBe("gpt-5.2-codex");
  });

  it("maps unknown / API-only names to the fallback", () => {
    expect(normalizeCodexModel("gpt-4o", "gpt-5.1")).toBe("gpt-5.1");
    expect(normalizeCodexModel("", "gpt-5.1")).toBe("gpt-5.1");
    expect(normalizeCodexModel(null, "gpt-5.1")).toBe("gpt-5.1");
  });

  it("pattern-matches codex/gpt-5 families", () => {
    expect(normalizeCodexModel("gpt-5-codex", "gpt-5.1")).toBe("gpt-5.1-codex");
    expect(normalizeCodexModel("my-codex-max-model", "gpt-5.1")).toBe("gpt-5.1-codex-max");
  });
});

describe("toResponsesInput", () => {
  it("serializes user/assistant/tool turns without server ids", () => {
    const turns: ConversationTurn[] = [
      { role: "user", text: "hi" },
      {
        role: "assistant",
        text: "on it",
        toolCalls: [{ id: "call_1", name: "apply_ops", input: { ops: [] } }],
      },
      { role: "tool_results", results: [{ id: "call_1", content: "done" }] },
    ];
    const input = toResponsesInput(turns);
    expect(input[0]).toEqual({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "hi" }],
    });
    expect(input[1]).toEqual({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "on it" }],
    });
    expect(input[2]).toEqual({
      type: "function_call",
      name: "apply_ops",
      arguments: JSON.stringify({ ops: [] }),
      call_id: "call_1",
    });
    expect(input[3]).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: "done",
    });
  });
});

describe("buildResponsesBody", () => {
  it("sets the stateless Codex requirements", () => {
    const body = buildResponsesBody({
      model: "gpt-5.1",
      system: "sys",
      turns: [{ role: "user", text: "hi" }],
      tools: TOOLS,
    });
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.instructions).toBe("sys");
    expect(body.include).toEqual(["reasoning.encrypted_content"]);
    expect(body.reasoning).toMatchObject({ effort: "medium" });
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "apply_ops",
        description: "Apply ops",
        parameters: { type: "object", properties: {} },
        strict: false,
      },
    ]);
  });
});

describe("CodexStreamAccumulator", () => {
  it("aggregates text and tool calls from a completed response", () => {
    const acc = new CodexStreamAccumulator();
    acc.push({ type: "response.output_text.delta", delta: "Hel" });
    acc.push({ type: "response.output_text.delta", delta: "lo" });
    acc.push({
      type: "response.completed",
      response: {
        output: [
          { type: "message", content: [{ type: "output_text", text: "Hello" }] },
          {
            type: "function_call",
            name: "apply_ops",
            arguments: '{"ops":[]}',
            call_id: "call_9",
          },
        ],
      },
    });
    const result = acc.result();
    expect(result.text).toBe("Hello");
    expect(result.toolCalls).toEqual([
      { id: "call_9", name: "apply_ops", input: { ops: [] } },
    ]);
    expect(result.error).toBeUndefined();
  });

  it("falls back to deltas and per-item function calls without a completed event", () => {
    const acc = new CodexStreamAccumulator();
    acc.push({ type: "response.output_text.delta", delta: "partial" });
    acc.push({
      type: "response.output_item.done",
      item: { type: "function_call", name: "apply_ops", arguments: "{}", call_id: "c1" },
    });
    const result = acc.result();
    expect(result.text).toBe("partial");
    expect(result.toolCalls).toEqual([{ id: "c1", name: "apply_ops", input: {} }]);
  });

  it("surfaces a failure event as an error", () => {
    const acc = new CodexStreamAccumulator();
    acc.push({
      type: "response.failed",
      response: { error: { message: "usage limit reached" } },
    });
    expect(acc.result().error).toBe("usage limit reached");
  });
});
