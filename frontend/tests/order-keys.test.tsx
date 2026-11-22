import { describe, expect, it } from "vitest";
import { dropInvalidOrderKeys, isValidOrderKey } from "../src/utils/orderKeys";

describe("order keys", () => {
  it("accepts keys fractional-indexing generates", () => {
    for (const key of [
      "a0",
      "a1",
      "aV",
      "az",
      "b00",
      "b0V",
      "a0V",
      "Zz",
      "a0G",
    ]) {
      expect(isValidOrderKey(key), key).toBe(true);
    }
  });

  it("rejects malformed keys", () => {
    for (const key of [
      "",
      "a",
      "az0",
      "a10",
      "b0",
      "!x",
      "a0-",
      "A" + "0".repeat(26),
    ]) {
      expect(isValidOrderKey(key), key).toBe(false);
    }
  });

  it("keeps array identity when no order keys need repair", () => {
    const ok = [{ id: "1", index: "a0" }, { id: "2" }];
    expect(dropInvalidOrderKeys(ok)).toBe(ok);
  });

  it("keeps malformed elements between their valid stacking neighbors", () => {
    const back = { id: "back", index: "a0" };
    const middle = { id: "middle", index: "az0" };
    const front = { id: "front", index: "a1" };

    const repaired = dropInvalidOrderKeys([back, middle, front]);

    expect(repaired).toEqual([back, { id: "middle" }, front]);
    expect(repaired[0]).toBe(back);
    expect(repaired[2]).toBe(front);
    expect(middle.index).toBe("az0");
  });
});
