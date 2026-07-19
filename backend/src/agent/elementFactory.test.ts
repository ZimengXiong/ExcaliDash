import { describe, expect, it } from "vitest";
import { createTextElement, wrapText } from "./elementFactory";

describe("createTextElement", () => {
  it("keeps standalone text positioned from its top-left corner", () => {
    const text = createTextElement(40, 60, "Standalone");

    expect(text.x).toBe(40);
    expect(text.y).toBe(60);
    expect(text.textAlign).toBe("left");
    expect(text.verticalAlign).toBe("top");
  });

  it("stores a bound label around the supplied center anchor", () => {
    const text = createTextElement(100, 80, "Bound label", "container-1");

    expect(text.x + text.width / 2).toBe(100);
    expect(text.y + text.height / 2).toBe(80);
    expect(text.textAlign).toBe("center");
    expect(text.verticalAlign).toBe("middle");
    expect(text.containerId).toBe("container-1");
  });

  it("centers multiline bound text using the full estimated height", () => {
    const text = createTextElement(150, 120, "First\nSecond", "container-1");

    expect(text.height).toBe(50);
    expect(text.x + text.width / 2).toBe(150);
    expect(text.y + text.height / 2).toBe(120);
  });

  it("breaks a single token that is wider than the wrapping constraint", () => {
    const wrapped = wrapText("averylongunbrokentoken", 60, 20);

    expect(wrapped).toContain("\n");
    for (const line of wrapped.split("\n")) {
      expect(line.length).toBeLessThan("averylongunbrokentoken".length);
    }
  });
});
