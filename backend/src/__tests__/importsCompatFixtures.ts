import fs from "fs";
import os from "os";
import path from "path";
import JSZip from "jszip";

const createTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-import-"));

export const createExcalidashArchiveWithDuplicateDrawingIds =
  async (): Promise<string> => {
    const dir = createTempDir();
    const filePath = path.join(dir, "duplicate-drawing-ids.excalidash");
    const zip = new JSZip();

    const manifest = {
      format: "excalidash",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      unorganizedFolder: "Unorganized",
      collections: [] as unknown[],
      drawings: [
        {
          id: "duplicate-drawing-id",
          name: "Drawing One",
          filePath: "Unorganized/drawing-1.excalidraw",
          collectionId: null,
        },
        {
          id: "duplicate-drawing-id",
          name: "Drawing Two",
          filePath: "Unorganized/drawing-2.excalidraw",
          collectionId: null,
        },
      ],
    };

    zip.file("excalidash.manifest.json", JSON.stringify(manifest));
    zip.file(
      "Unorganized/drawing-1.excalidraw",
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "test",
        elements: [],
        appState: {},
        files: {},
      }),
    );
    zip.file(
      "Unorganized/drawing-2.excalidraw",
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "test",
        elements: [],
        appState: {},
        files: {},
      }),
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    fs.writeFileSync(filePath, buffer);
    return filePath;
  };
