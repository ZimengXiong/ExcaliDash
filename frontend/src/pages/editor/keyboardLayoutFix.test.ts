import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachKeyboardLayoutFix } from "./keyboardLayoutFix";

describe("attachKeyboardLayoutFix (non-Latin keyboard layouts)", () => {
  let detach: () => void;
  let container: HTMLDivElement;
  let seenKeys: string[];

  /** Dispatches from inside the editor and reports what a listener above sees. */
  const press = (
    init: KeyboardEventInit,
    from: HTMLElement = container,
  ): string | undefined => {
    from.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
    return seenKeys.at(-1);
  };

  beforeEach(() => {
    seenKeys = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    container.addEventListener("keydown", (event) => {
      seenKeys.push(event.key);
    });
    detach = attachKeyboardLayoutFix(document);
  });

  afterEach(() => {
    detach();
    container.remove();
  });

  it("maps a Cyrillic letter to the Latin letter on the same physical key", () => {
    expect(press({ key: "к", code: "KeyR" })).toBe("r");
    expect(press({ key: "щ", code: "KeyO" })).toBe("o");
  });

  it("keeps the case so shift behaves as it does on a Latin layout", () => {
    expect(press({ key: "К", code: "KeyR", shiftKey: true })).toBe("R");
  });

  it("leaves Latin characters alone", () => {
    expect(press({ key: "r", code: "KeyR" })).toBe("r");
    expect(press({ key: "R", code: "KeyR", shiftKey: true })).toBe("R");
  });

  it("maps modifier combos too, for platforms that do not substitute Latin", () => {
    expect(press({ key: "я", code: "KeyZ", metaKey: true })).toBe("z");
    expect(press({ key: "ы", code: "KeyS", ctrlKey: true })).toBe("s");
  });

  it("does not touch typing in text fields", () => {
    const textarea = document.createElement("textarea");
    container.appendChild(textarea);
    expect(press({ key: "к", code: "KeyR" }, textarea)).toBe("к");

    const input = document.createElement("input");
    container.appendChild(input);
    expect(press({ key: "к", code: "KeyR" }, input)).toBe("к");
  });

  it("does not touch IME composition", () => {
    expect(press({ key: "к", code: "KeyR", isComposing: true })).toBe("к");
    expect(press({ key: "к", code: "KeyR", keyCode: 229 })).toBe("к");
  });

  it("leaves alt shortcuts alone (Excalidraw matches those on the code)", () => {
    expect(press({ key: "®", code: "KeyR", altKey: true })).toBe("®");
  });

  it("ignores keys that are not letters", () => {
    expect(press({ key: ".", code: "Slash" })).toBe(".");
    expect(press({ key: "Escape", code: "Escape" })).toBe("Escape");
    expect(press({ key: "1", code: "Digit1" })).toBe("1");
  });

  it("stops rewriting once detached", () => {
    detach();
    expect(press({ key: "к", code: "KeyR" })).toBe("к");
  });
});
