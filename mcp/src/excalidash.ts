import type { OpsResult } from "./operations.js";
import {
  appendImage,
  decodeImage,
  type SceneData,
  type ImageInput,
} from "./scene.js";
export type ExcaliDashConfig = {
  url: string;
  token: string;
  drawingId?: string;
};

export type DrawingSummary = {
  id: string;
  name: string;
  engine?: "excalidraw" | "tldraw";
  collectionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type DrawingScene = DrawingSummary & SceneData;
export type Collection = {
  id: string;
  name: string;
  isOwner?: boolean;
  sharedRole?: string | null;
  [key: string]: unknown;
};

export type DrawingList = {
  drawings: DrawingSummary[];
  totalCount: number;
  limit: number;
  offset: number;
};

export type Fetch = typeof globalThis.fetch;

export class ExcaliDashError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ExcaliDashError";
  }
}

const apiBase = (url: string): string => {
  const base = url.trim().replace(/\/+$/, "");
  if (!base) throw new Error("EXCALIDASH_URL is required");
  return base.endsWith("/api") ? base : `${base}/api`;
};

export const configFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ExcaliDashConfig => {
  const url = env.EXCALIDASH_URL?.trim();
  const token = env.EXCALIDASH_API_KEY?.trim() || env.EXCALIDASH_TOKEN?.trim();
  const drawingId = env.EXCALIDASH_DRAWING_ID?.trim() || undefined;

  if (!url) throw new Error("EXCALIDASH_URL is required");
  if (!token) {
    throw new Error(
      "EXCALIDASH_API_KEY is required (EXCALIDASH_TOKEN is accepted for compatibility)",
    );
  }

  return { url, token, drawingId };
};

export class ExcaliDashClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: ExcaliDashConfig,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {
    this.baseUrl = apiBase(config.url);
  }

  listDrawings(
    options: {
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<DrawingList> {
    const query = new URLSearchParams({
      limit: String(options.limit ?? 50),
      offset: String(options.offset ?? 0),
    });
    if (options.search) query.set("search", options.search);
    return this.request(`drawings?${query}`);
  }

  createDrawing(name: string): Promise<DrawingSummary> {
    return this.request("drawings", {
      method: "POST",
      body: JSON.stringify({
        name,
        engine: "excalidraw",
        elements: [],
        appState: {},
        files: {},
      }),
    });
  }
  async getDrawing(drawingId: string): Promise<DrawingScene> {
    const scene = await this.request<DrawingScene>(
      `drawings/${encodeURIComponent(drawingId)}`,
    );
    if (
      !scene ||
      !Array.isArray(scene.elements) ||
      !Number.isInteger(scene.version) ||
      !scene.files ||
      typeof scene.files !== "object" ||
      Array.isArray(scene.files) ||
      !scene.appState ||
      typeof scene.appState !== "object" ||
      Array.isArray(scene.appState)
    ) {
      throw new Error("Invalid drawing scene response");
    }
    return scene;
  }

  updateDrawing(
    id: string,
    patch: { name?: string; collectionId?: string | null },
  ): Promise<DrawingScene> {
    return this.request(`drawings/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  }
  deleteDrawing(id: string): Promise<{ success: boolean }> {
    return this.request(`drawings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
  listCollections(): Promise<Collection[]> {
    return this.request("collections");
  }
  createCollection(name: string): Promise<Collection> {
    return this.request("collections", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }
  renameCollection(id: string, name: string): Promise<Collection> {
    return this.request(`collections/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  }
  deleteCollection(id: string): Promise<{ success: boolean }> {
    return this.request(`collections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
  async addImage(drawingId: string, input: ImageInput) {
    const image = decodeImage(input);
    const scene = await this.getDrawing(drawingId);
    if (scene.engine !== undefined && scene.engine !== "excalidraw")
      throw new Error("Unsupported drawing engine");
    const built = appendImage(scene, input, image);
    const saved = await this.request<DrawingScene>(
      `drawings/${encodeURIComponent(drawingId)}`,
      {
        method: "PUT",
        body: JSON.stringify(built.patch),
      },
    );
    if (!Number.isInteger(saved.version) || saved.version <= scene.version)
      throw new Error(
        "Image write response missing new version; read drawing, do not retry",
      );
    return {
      drawingId,
      elementId: built.elementId,
      fileId: built.fileId,
      version: saved.version,
    };
  }

  getSummary(drawingId: string): Promise<string> {
    return this.request(`drawings/${encodeURIComponent(drawingId)}/summary`, {
      responseType: "text",
    });
  }

  inspectElement(drawingId: string, elementId: string): Promise<unknown> {
    return this.request(
      `drawings/${encodeURIComponent(drawingId)}/elements/${encodeURIComponent(elementId)}`,
    );
  }

  applyOps(
    drawingId: string,
    ops: unknown[],
    clientBatchId?: string,
  ): Promise<OpsResult> {
    return this.request(`drawings/${encodeURIComponent(drawingId)}/ops`, {
      method: "POST",
      body: JSON.stringify({
        ops,
        ...(clientBatchId ? { clientBatchId } : {}),
      }),
    });
  }

  async probe(): Promise<void> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/drawings?limit=1&offset=0`,
      {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (
      response.status !== 200 ||
      response.headers.get("content-type")?.split(";")[0]?.trim() !==
        "application/json"
    ) {
      await response.body?.cancel();
      throw new Error("API unavailable");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing API body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) throw new Error("Probe body too large");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    const value: unknown = JSON.parse(
      Buffer.concat(chunks, size).toString("utf8"),
    );
    if (typeof value !== "object" || value === null)
      throw new Error("Invalid API body");
    const v = value as Record<string, unknown>;
    if (
      !Array.isArray(v.drawings) ||
      v.limit !== 1 ||
      !["totalCount", "offset"].every(
        (k) => Number.isInteger(v[k]) && Number(v[k]) >= 0,
      )
    ) {
      throw new Error("Invalid drawing list");
    }
  }

  private async request<T = unknown>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: string;
      responseType?: "json" | "text";
    } = {},
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept:
          options.responseType === "text" ? "text/plain" : "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body,
      redirect: "error",
    });

    if (!response.ok) {
      const detail = (await response.text())
        .replaceAll(this.config.token, "[redacted]")
        .slice(0, 2000);
      throw new ExcaliDashError(
        `ExcaliDash request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        response.status,
      );
    }

    if (options.responseType === "text") return (await response.text()) as T;
    return (await response.json()) as T;
  }
}
