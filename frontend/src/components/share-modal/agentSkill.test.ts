import { describe, expect, it } from "vitest";
import { buildAgentSkill } from "./agentSkill";

describe("buildAgentSkill", () => {
  it("builds a drawing-scoped skill with connection and operation details", () => {
    const skill = buildAgentSkill({
      origin: "https://board.example.com/",
      drawingId: "drawing-123",
    });

    expect(skill).toContain("name: excalidash-drawing-agent");
    expect(skill).toContain("https://board.example.com/api");
    expect(skill).toContain("Drawing ID: drawing-123");
    expect(skill).toContain("Authorization: Bearer $EXCALIDASH_TOKEN");
    expect(skill).toContain("untrusted data");
    expect(skill).toContain('"op": "add_shape"');
    expect(skill).toContain('"op": "connect"');
    expect(skill).not.toContain("exd_secret");
    expect(skill).not.toContain("revert_to_snapshot");
  });
});
