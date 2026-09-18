import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorIdentity } from "./useEditorIdentity";
import { getColorFromString } from "./shared";
import { getUserIdentity } from "../../utils/identity";

vi.mock("../../utils/identity", () => ({
  getUserIdentity: vi.fn(),
}));

describe("useEditorIdentity", () => {
  const getUserIdentityMock = vi.mocked(getUserIdentity);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds identity from authenticated user", () => {
    getUserIdentityMock.mockReturnValue({
      id: "anon",
      name: "Anonymous",
      initials: "AN",
      color: "#999",
    });

    const { result } = renderHook(() =>
      useEditorIdentity({
        id: "u-1",
        name: "Jane Doe",
      }),
    );

    expect(result.current).toEqual({
      id: "u-1",
      name: "Jane Doe",
      initials: "JD",
      color: getColorFromString("u-1"),
    });
    expect(getUserIdentityMock).not.toHaveBeenCalled();
  });

  it("falls back to generated identity when user is missing", () => {
    getUserIdentityMock.mockReturnValue({
      id: "guest-1",
      name: "Guest User",
      initials: "GU",
      color: "#123456",
    });

    const { result } = renderHook(() => useEditorIdentity(null));

    expect(getUserIdentityMock).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({
      id: "guest-1",
      name: "Guest User",
      initials: "GU",
      color: "#123456",
    });
  });
});
