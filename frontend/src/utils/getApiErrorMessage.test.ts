import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { getApiErrorMessage } from "./getApiErrorMessage";

describe("getApiErrorMessage", () => {
  it("extracts API message and falls back for ordinary errors", () => {
    const error = new AxiosError("request failed"); error.response = { data: { message: "Nope" } } as never;
    expect(getApiErrorMessage(error, "fallback")).toBe("Nope");
    expect(getApiErrorMessage(new Error("broken"), "fallback")).toBe("broken");
    expect(getApiErrorMessage({}, "fallback")).toBe("fallback");
  });
});
