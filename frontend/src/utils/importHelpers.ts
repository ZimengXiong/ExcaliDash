import { exportToSvg } from "@excalidraw/excalidraw";
import { api } from "../api";

type ExcalidrawLikeData = {
  type?: unknown;
  version?: unknown;
  source?: unknown;
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
  data?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type LegacyExportDrawing = {
  id?: string;
  name?: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown>;
  collectionId?: string | null;
  collectionName?: string | null;
  createdAt?: string | number;
  updatedAt?: string | number;
  preview?: string | null;
  version?: number;
};

type LegacyExportJson = {
  version?: string;
  exportedAt?: string;
  userId?: string;
  drawings: LegacyExportDrawing[];
};

export const isLegacyExportJson = (data: unknown): data is LegacyExportJson => {
  if (typeof data !== "object" || data === null) return false;
  const maybe = data as Record<string, unknown>;
  return Array.isArray(maybe.drawings);
};

export const coerceTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
};

const parseOptionalJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as T;
  return fallback;
};

export const extractDrawingData = (
  input: unknown,
): {
  elements: any[];
  appState: Record<string, any>;
  files: Record<string, any>;
} | null => {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as ExcalidrawLikeData;
  const maybeNested = raw.data;
  const candidate: ExcalidrawLikeData =
    typeof maybeNested === "object" && maybeNested !== null
      ? (maybeNested as ExcalidrawLikeData)
      : raw;
  const elements = parseOptionalJson<any[]>(candidate.elements, []);
  const appState = parseOptionalJson<Record<string, any>>(
    candidate.appState,
    {},
  );
  const files = parseOptionalJson<Record<string, any>>(candidate.files, {});
  if (!Array.isArray(elements)) return null;
  if (typeof appState !== "object" || appState === null) return null;
  if (typeof files !== "object" || files === null) return null;
  return { elements, appState, files };
};

export const makeSvgPreview = async (
  elements: any[],
  appState: Record<string, any>,
  files: Record<string, any>,
) => {
  return exportToSvg({
    elements,
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    },
    files: files || {},
    exportPadding: 10,
  });
};

export const createCollectionResolver = () => {
  let existingCollectionsByLowerName: Map<string, string> | null = null;
  const ensureCollectionsIndex = async () => {
    if (existingCollectionsByLowerName) return;
    const response =
      await api.get<{ id: string; name: string }[]>("/collections");
    existingCollectionsByLowerName = new Map(
      (response.data || [])
        .filter(
          (c) => c && typeof c.name === "string" && typeof c.id === "string",
        )
        .map((c) => [c.name.trim().toLowerCase(), c.id]),
    );
  };
  const getOrCreateCollectionIdByName = async (name: string) => {
    await ensureCollectionsIndex();
    const key = name.trim().toLowerCase();
    const existing = existingCollectionsByLowerName!.get(key);
    if (existing) return existing;
    const created = await api.post<{ id: string; name: string }>(
      "/collections",
      { name },
    );
    existingCollectionsByLowerName!.set(key, created.data.id);
    return created.data.id;
  };
  return { getOrCreateCollectionIdByName };
};

const basenameWithoutExt = (filePath: string): string => {
  const base = filePath.split("/").pop() || filePath;
  return base.replace(/\.(json|excalidraw)$/, "");
};

export const importLegacyZip = async (
  file: File,
  targetCollectionId: string | null,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((e: any) => !e.dir);
  const hasExcalidashManifest = entries.some(
    (e: any) => e.name === "excalidash.manifest.json",
  );
  if (hasExcalidashManifest) {
    return {
      success: 0,
      failed: 1,
      errors: [
        `${file.name}: This looks like an ExcaliDash backup (.excalidash). Use "Import Backup" instead of Legacy Import.`,
      ],
    };
  }
  const collectionResolver = createCollectionResolver();
  const drawableEntries = entries.filter((e: any) => {
    const name = String(e.name || "");
    return name.endsWith(".excalidraw") || name.endsWith(".json");
  });
  if (drawableEntries.length === 0) {
    return {
      success: 0,
      failed: 1,
      errors: [`${file.name}: Zip contains no .excalidraw/.json drawings.`],
    };
  }
  for (const entry of drawableEntries) {
    const entryName = String((entry as any).name || "");
    try {
      const raw = await (entry as any).async("string");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Invalid JSON: ${entryName}`);
      }
      if (isLegacyExportJson(parsed)) {
        const exportJson = parsed;
        const drawings = Array.isArray(exportJson.drawings)
          ? exportJson.drawings
          : [];
        for (let i = 0; i < drawings.length; i += 1) {
          const d = drawings[i] as LegacyExportDrawing;
          const extracted = extractDrawingData(d);
          if (!extracted) {
            failed += 1;
            errors.push(
              `${file.name}:${entryName}: drawing ${i + 1}: Invalid structure (missing elements/appState)`,
            );
            continue;
          }
          let collectionId: string | null = null;
          if (targetCollectionId !== null) collectionId = targetCollectionId;
          else if (d.collectionId === "trash" || d.collectionName === "Trash")
            collectionId = "trash";
          else if (
            typeof d.collectionName === "string" &&
            d.collectionName.trim()
          ) {
            collectionId =
              await collectionResolver.getOrCreateCollectionIdByName(
                d.collectionName.trim(),
              );
          }
          const svg = await makeSvgPreview(
            extracted.elements,
            extracted.appState,
            extracted.files,
          );
          const payload = {
            name:
              typeof d.name === "string" && d.name.trim().length > 0
                ? d.name
                : `Imported Drawing ${i + 1}`,
            elements: extracted.elements,
            appState: extracted.appState,
            files: extracted.files || null,
            collectionId,
            createdAt: coerceTimestamp(d.createdAt),
            updatedAt: coerceTimestamp(d.updatedAt),
            preview: svg.outerHTML,
          };
          await api.post("/drawings", payload, {
            headers: { "X-Imported-File": "true" },
          });
          success += 1;
        }
        continue;
      }
      const extracted = extractDrawingData(parsed);
      if (!extracted)
        throw new Error(`Invalid drawing structure: ${entryName}`);
      let collectionId: string | null = null;
      if (targetCollectionId !== null) collectionId = targetCollectionId;
      else {
        const folder = entryName.includes("/") ? entryName.split("/")[0] : "";
        collectionId =
          folder && folder !== "Unorganized"
            ? await collectionResolver.getOrCreateCollectionIdByName(folder)
            : null;
      }
      const svg = await makeSvgPreview(
        extracted.elements,
        extracted.appState,
        extracted.files,
      );
      const payload = {
        name:
          basenameWithoutExt(entryName) ||
          basenameWithoutExt(file.name) ||
          "Imported Drawing",
        elements: extracted.elements,
        appState: extracted.appState,
        files: extracted.files || null,
        collectionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preview: svg.outerHTML,
      };
      await api.post("/drawings", payload, {
        headers: { "X-Imported-File": "true" },
      });
      success += 1;
    } catch (err: any) {
      failed += 1;
      errors.push(
        `${file.name}:${entryName}: ${err?.message || "Failed to import zip entry"}`,
      );
    }
  }
  return { success, failed, errors };
};
