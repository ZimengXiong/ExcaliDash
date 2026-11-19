#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Socket } from "node:net";
import { isInitializeRequest } from "@modelcontextprotocol/server";
import {
  hostHeaderValidation,
  NodeStreamableHTTPServerTransport,
} from "@modelcontextprotocol/node";
import { configFromEnv, ExcaliDashClient } from "./excalidash.js";
import { createServer as createMcpServer } from "./index.js";

const DEFAULT_PORT = 8080;
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_SESSIONS = 64;
const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

type HttpConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  maxSessions: number;
  sessionIdleMs: number;
  allowedHosts: string[];
  allowedOrigins?: string[];
};

const positiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const portNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error("MCP_HTTP_PORT must be an integer between 0 and 65535");
  }
  return parsed;
};

const origin = (raw: string): string => {
  const url = new URL(raw);
  if (
    !/^https?:\/\/[^/?#]+$/.test(raw) ||
    url.username ||
    url.password ||
    raw.includes("*")
  ) {
    throw new Error("Expected an exact HTTP(S) origin");
  }
  return url.origin;
};
const envList = (value: string): string[] => {
  const entries = value.split(",").map((value) => value.trim());
  if (entries.some((value) => !value || value.includes("*")))
    throw new Error("Invalid allowlist");
  return entries;
};
const hosts = (value?: string): string[] => {
  if (value === undefined) return ["localhost", "127.0.0.1", "[::1]"];
  const entries = envList(value);
  for (const host of entries) {
    const url = new URL(`http://${host}`);
    if (
      url.hostname !== host ||
      url.port ||
      url.pathname !== "/" ||
      url.username ||
      url.password
    )
      throw new Error("Expected hostname without port");
  }
  return entries;
};
export const httpConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): HttpConfig => ({
  host: env.MCP_HTTP_HOST?.trim() || "127.0.0.1",
  port: portNumber(env.MCP_HTTP_PORT, DEFAULT_PORT),
  allowedHosts: hosts(env.MCP_ALLOWED_HOSTS),
  allowedOrigins:
    env.MCP_ALLOWED_ORIGINS === undefined
      ? undefined
      : envList(env.MCP_ALLOWED_ORIGINS).map(origin),
  maxBodyBytes: positiveInteger(
    env.MCP_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES,
    "MCP_MAX_BODY_BYTES",
  ),
  maxSessions: positiveInteger(
    env.MCP_MAX_SESSIONS,
    DEFAULT_MAX_SESSIONS,
    "MCP_MAX_SESSIONS",
  ),
  sessionIdleMs: positiveInteger(
    env.MCP_SESSION_IDLE_MS,
    DEFAULT_SESSION_IDLE_MS,
    "MCP_SESSION_IDLE_MS",
  ),
});

/**
 * Request-target path without the query string. Never parses the attacker
 * controlled Host header: building a URL from it throws on a malformed value,
 * and a throw inside the request listener terminates the process.
 */
export const requestPathname = (rawUrl = "/"): string => {
  const queryStart = rawUrl.indexOf("?");
  const path = queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart);
  return path.startsWith("/") ? path : `/${path}`;
};

const jsonRpcError = (
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void => {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
  );
};

const readJsonBody = async (
  req: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new RangeError("Request body too large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

type SessionEntry = {
  transport: NodeStreamableHTTPServerTransport;
  lastSeen: number;
};

export const startHttpServer = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<Server> => {
  const excalidashConfig = configFromEnv(env);
  const httpConfig = httpConfigFromEnv(env);
  const client = new ExcaliDashClient(excalidashConfig);
  const sessions = new Map<string, SessionEntry>();
  const validateHost = hostHeaderValidation(httpConfig.allowedHosts);
  const allowedOrigins = new Set(httpConfig.allowedOrigins);
  const validateOrigin = (
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean => {
    const raw = req.headers.origin;
    if (raw === undefined) return true;
    try {
      if (allowedOrigins.has(origin(raw))) return true;
    } catch {
      /* malformed origins are denied */
    }
    res.writeHead(403).end("Forbidden Origin");
    return false;
  };

  const closeSession = (id: string): void => {
    const entry = sessions.get(id);
    if (!entry) return;
    sessions.delete(id);
    void entry.transport.close().catch(() => undefined);
  };

  // Abandoned sessions are never closed by their client, so without this sweep
  // each initialize leaks one transport for the lifetime of the process.
  const sweepIdleSessions = (): void => {
    const cutoff = Date.now() - httpConfig.sessionIdleMs;
    for (const [id, entry] of sessions) {
      if (entry.lastSeen <= cutoff) closeSession(id);
    }
  };

  const sweeper = setInterval(
    sweepIdleSessions,
    Math.min(SWEEP_INTERVAL_MS, httpConfig.sessionIdleMs),
  );
  sweeper.unref();

  type ParsedBody = { ok: true; body: unknown } | { ok: false };

  const parseBody = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<ParsedBody> => {
    if (req.method !== "POST") return { ok: true, body: undefined };
    try {
      return {
        ok: true,
        body: await readJsonBody(req, httpConfig.maxBodyBytes),
      };
    } catch (error) {
      if (error instanceof RangeError) {
        jsonRpcError(res, 413, -32000, error.message);
      } else {
        jsonRpcError(res, 400, -32700, "Invalid JSON body");
      }
      return { ok: false };
    }
  };

  const readSessionId = (req: IncomingMessage): string | undefined => {
    const header = req.headers["mcp-session-id"];
    return Array.isArray(header) ? header[0] : header;
  };

  const openSession = async (
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> => {
    sweepIdleSessions();
    if (sessions.size >= httpConfig.maxSessions) {
      jsonRpcError(res, 429, -32000, "Too many active MCP sessions");
      return;
    }

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (id): void => {
        sessions.set(id, { transport, lastSeen: Date.now() });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await createMcpServer(client, excalidashConfig.drawingId).connect(
      transport,
    );
    await transport.handleRequest(req, res, body);
  };

  const routeMcp = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    const parsed = await parseBody(req, res);
    if (!parsed.ok) return;
    const { body } = parsed;

    const sessionId = readSessionId(req);
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      existing.lastSeen = Date.now();
      await existing.transport.handleRequest(req, res, body);
      return;
    }

    if (!sessionId && req.method === "POST" && isInitializeRequest(body)) {
      await openSession(req, res, body);
      return;
    }

    jsonRpcError(
      res,
      sessionId ? 404 : 400,
      sessionId ? -32001 : -32000,
      sessionId ? "Session not found" : "MCP session initialization required",
    );
  };

  const failRequest = (res: ServerResponse, error: unknown): void => {
    console.error("MCP request failed", error);
    if (!res.headersSent) jsonRpcError(res, 500, -32603, "Internal error");
    else if (!res.writableEnded) res.end();
  };

  const server = createNodeServer((req, res) => {
    // A synchronous throw in this listener is an uncaught exception and kills
    // the process, so every branch stays inside this guard.
    try {
      const pathname = requestPathname(req.url);

      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.method === "GET" && pathname === "/ready") {
        void client.probe().then(
          () => {
            res
              .writeHead(200, { "Content-Type": "application/json" })
              .end(JSON.stringify({ status: "ready" }));
          },
          () => {
            res
              .writeHead(503, { "Content-Type": "application/json" })
              .end(JSON.stringify({ status: "not_ready" }));
          },
        );
        return;
      }
      if (pathname !== "/mcp") {
        res.writeHead(404).end();
        return;
      }
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;

      void routeMcp(req, res).catch((error) => failRequest(res, error));
    } catch (error) {
      failRequest(res, error);
    }
  });

  server.on("clientError", (_error: Error, socket: Socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    }
    socket.destroy();
  });

  const shutdown = async (): Promise<void> => {
    clearInterval(sweeper);
    await Promise.allSettled(
      [...sessions.values()].map((entry) => entry.transport.close()),
    );
    sessions.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  const onSignal = (): void => {
    void shutdown();
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  server.once("close", () => {
    clearInterval(sweeper);
    for (const id of sessions.keys()) closeSession(id);
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(httpConfig.port, httpConfig.host, () => {
      server.off("error", reject);
      resolve();
      if (httpConfig.allowedOrigins === undefined) {
        const address = server.address();
        const port =
          typeof address === "object" && address
            ? address.port
            : httpConfig.port;
        for (const host of ["localhost", "127.0.0.1", "[::1]"])
          allowedOrigins.add(`http://${host}:${port}`);
      }
    });
  });
  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startHttpServer()
    .then((server) => {
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : DEFAULT_PORT;
      console.log(
        `ExcaliDash MCP listening on ${typeof address === "object" && address ? address.address : "unknown"}:${port}/mcp`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
