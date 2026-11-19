/**
 * Built-in MCP endpoint (POST/GET/DELETE /mcp, public path /api/mcp).
 *
 * The MCP server itself lives in ../../../mcp (based on
 * github.com/LatikDesu/excalidash-mcp, MIT; see NOTICE). Its embedded handler
 * authenticates every session with the caller's own API key and performs all
 * work through this backend's REST API over the local socket, so scopes,
 * sharing rules and validation are exactly those of the regular API.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import type express from "express";
import { config } from "../config";

type EmbeddedMcpHandler = {
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void>;
  close(): Promise<void>;
  readonly sessionCount: number;
};

type EmbeddedMcpModule = {
  createEmbeddedMcpHandler(options: {
    apiBaseUrl: (req: IncomingMessage) => string;
    internalHeaders?: Record<string, string>;
    maxSessions?: number;
    maxSessionsPerKey?: number;
    sessionIdleMs?: number;
  }): EmbeddedMcpHandler;
};

export const MCP_INTERNAL_HEADER = "x-excalidash-mcp-internal";

// Per-process secret marking the backend's own loopback calls made on behalf
// of an MCP session. It never leaves the process.
const internalSecret = crypto.randomBytes(32).toString("hex");

/**
 * True for API requests the MCP endpoint makes to this backend. They are
 * exempt from the general rate limiter: the MCP request that caused them was
 * already counted against the real client.
 */
export const isInternalMcpRequest = (req: {
  headers: Record<string, unknown>;
}): boolean => {
  const value = req.headers[MCP_INTERNAL_HEADER];
  if (typeof value !== "string" || value.length !== internalSecret.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(value),
    Buffer.from(internalSecret),
  );
};

const moduleCandidates = (): string[] => {
  const backendRoot = path.resolve(__dirname, "../../");
  return [
    config.mcp.modulePath,
    path.join(backendRoot, "mcp/dist/embedded.js"),
    path.resolve(backendRoot, "../mcp/dist/embedded.js"),
  ].filter((value): value is string => Boolean(value));
};

const loadEmbeddedModule = async (): Promise<EmbeddedMcpModule | null> => {
  for (const candidate of moduleCandidates()) {
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) continue;
    const loaded = (await import(resolved)) as Partial<EmbeddedMcpModule>;
    if (typeof loaded.createEmbeddedMcpHandler === "function") {
      return loaded as EmbeddedMcpModule;
    }
  }
  return null;
};

/** Loopback base URL of the socket the request arrived on. */
const localApiBaseUrl = (req: IncomingMessage): string => {
  const socket = req.socket;
  let host = socket.localAddress || "127.0.0.1";
  if (host.startsWith("::ffff:")) host = host.slice("::ffff:".length);
  if (host === "::" || host === "0.0.0.0") host = "127.0.0.1";
  if (host.includes(":")) host = `[${host}]`;
  return `http://${host}:${socket.localPort}`;
};

export type McpEndpoint = {
  enabled: boolean;
  isAvailable: () => boolean;
  close: () => Promise<void>;
};

export const registerMcpRoutes = (app: express.Express): McpEndpoint => {
  const enabled = config.mcp.enabled;
  let handler: EmbeddedMcpHandler | null = null;
  let loadError: string | null = null;

  const ready: Promise<void> = enabled
    ? loadEmbeddedModule()
        .then((mod) => {
          if (!mod) {
            loadError =
              "MCP_ENABLED is true but mcp/dist/embedded.js was not found. Run `npm --prefix mcp run build` or set MCP_MODULE_PATH.";
            console.error(`[mcp] ${loadError}`);
            return;
          }
          handler = mod.createEmbeddedMcpHandler({
            apiBaseUrl: localApiBaseUrl,
            internalHeaders: { [MCP_INTERNAL_HEADER]: internalSecret },
            maxSessions: config.mcp.maxSessions,
            maxSessionsPerKey: config.mcp.maxSessionsPerKey,
            sessionIdleMs: config.mcp.sessionIdleMs,
          });
          console.log("[mcp] MCP endpoint enabled at /api/mcp");
        })
        .catch((error: unknown) => {
          loadError = "Failed to load the MCP server module";
          console.error(`[mcp] ${loadError}:`, error);
        })
    : Promise.resolve();

  app.get("/mcp/status", async (_req, res) => {
    await ready;
    res.json({ enabled, available: Boolean(handler), path: "/api/mcp" });
  });

  app.all("/mcp", async (req, res) => {
    if (!enabled) {
      return res.status(404).json({
        error: "Not found",
        message: "The MCP endpoint is disabled. Set MCP_ENABLED=true.",
      });
    }
    await ready;
    if (!handler) {
      return res.status(503).json({
        error: "Service unavailable",
        message: loadError ?? "The MCP endpoint is not available",
      });
    }
    try {
      await handler.handle(req, res, req.body);
    } catch (error) {
      console.error("[mcp] Request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return {
    enabled,
    isAvailable: () => Boolean(handler),
    close: async () => {
      await ready;
      if (handler) await handler.close();
    },
  };
};
