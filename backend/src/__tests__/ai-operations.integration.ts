import { describe, expect, it } from "vitest";
import { aiResponseSchema } from "../ai/operations";

describe("native AI frame operations", () => {
  it("accepts a frame with explicit children", () => {
    const response = aiResponseSchema.parse({
      message: "Frame created",
      operations: [
        {
          type: "create",
          elements: [
            {
              id: "frame",
              type: "frame",
              x: 0,
              y: 0,
              children: ["existing"],
            },
          ],
        },
      ],
    });
    expect(response.operations[0].type).toBe("create");
  });

  it("rejects frame lookalikes missing native frame metadata", () => {
    expect(() =>
      aiResponseSchema.parse({
        message: "Invalid frame",
        operations: [
          {
            type: "create",
            elements: [{ type: "frame", x: 0, y: 0 }],
          },
        ],
      }),
    ).toThrow();
  });
});
