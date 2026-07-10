import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useEditorFileUploads } from "./useEditorFileUploads";

vi.mock("../../api", () => ({
  isFileUploadSupported: vi.fn(() => true),
  uploadDrawingFile: vi.fn(),
}));
vi.mock("../../utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files: any) => ({
    changed: false,
    files,
    changedIds: [],
  })),
}));

const uploadDrawingFile = vi.mocked(api.uploadDrawingFile);
const isFileUploadSupported = vi.mocked(api.isFileUploadSupported);

const dataFile = (id: string) => ({
  id,
  mimeType: "image/webp",
  dataURL: "data:image/webp;base64,QUJD",
});

const setup = (files: Record<string, any>) => {
  const uploadedRefs = { current: {} as Record<string, string> };
  const addFiles = vi.fn();
  const excalidrawAPI = { current: { getFiles: () => files, addFiles } };
  const { result } = renderHook(() =>
    useEditorFileUploads({
      drawingId: "d1",
      isReady: false,
      excalidrawAPI,
      isSyncing: { current: false },
      latestFiles: { current: files },
      uploadedRefs,
    }),
  );
  return { result, uploadedRefs };
};

describe("useEditorFileUploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFileUploadSupported.mockReturnValue(true);
  });

  it("uploads inline images and records their ref URLs", async () => {
    uploadDrawingFile.mockImplementation(async (drawingId, fileId) => ({
      url: `/api/files/${drawingId}/${fileId}`,
    }));
    const { result, uploadedRefs } = setup({ a: dataFile("a"), b: dataFile("b") });

    await result.current.scanNow();

    expect(uploadDrawingFile).toHaveBeenCalledTimes(2);
    expect(uploadedRefs.current.a).toBe("/api/files/d1/a");
    expect(uploadedRefs.current.b).toBe("/api/files/d1/b");
    // Raw bytes are sent, not the dataURL string.
    expect(uploadDrawingFile.mock.calls[0][2]).toBeInstanceOf(Uint8Array);
  });

  it("skips files that are already refs or already uploaded", async () => {
    uploadDrawingFile.mockResolvedValue({ url: "/api/files/d1/a" });
    const files = {
      a: dataFile("a"),
      ref: { id: "ref", mimeType: "image/png", dataURL: "/api/files/d1/ref" },
    };
    const { result } = setup(files);

    await result.current.scanNow();

    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);
    expect(uploadDrawingFile.mock.calls[0][1]).toBe("a");
  });

  it("caps concurrency at 3", async () => {
    let active = 0;
    let maxActive = 0;
    uploadDrawingFile.mockImplementation(async (_d, id) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { url: `/api/files/d1/${id}` };
    });
    const files = Object.fromEntries(
      ["a", "b", "c", "d", "e"].map((id) => [id, dataFile(id)]),
    );
    const { result } = setup(files);

    await result.current.scanNow();

    expect(uploadDrawingFile).toHaveBeenCalledTimes(5);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("retries a failed upload once and then succeeds", async () => {
    let calls = 0;
    uploadDrawingFile.mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error("network");
      return { url: "/api/files/d1/a" };
    });
    const { result, uploadedRefs } = setup({ a: dataFile("a") });

    await result.current.scanNow();

    expect(calls).toBe(2);
    expect(uploadedRefs.current.a).toBe("/api/files/d1/a");
  });

  it("gives up after two failed attempts and records no ref", async () => {
    uploadDrawingFile.mockRejectedValue(new Error("network"));
    const { result, uploadedRefs } = setup({ a: dataFile("a") });

    await result.current.scanNow();

    expect(uploadDrawingFile).toHaveBeenCalledTimes(2);
    expect(uploadedRefs.current).toEqual({});
  });

  it("records no ref when the backend lacks the endpoint (null result)", async () => {
    uploadDrawingFile.mockResolvedValue(null);
    const { result, uploadedRefs } = setup({ a: dataFile("a") });

    await result.current.scanNow();

    expect(uploadedRefs.current).toEqual({});
  });

  it("does nothing when uploads are unsupported for the session", async () => {
    isFileUploadSupported.mockReturnValue(false);
    const { result } = setup({ a: dataFile("a") });

    await result.current.scanNow();

    expect(uploadDrawingFile).not.toHaveBeenCalled();
  });
});
