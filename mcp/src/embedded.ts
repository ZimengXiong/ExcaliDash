/**
 * Streamable HTTP MCP handler meant to be mounted inside the ExcaliDash
 * backend (see backend/src/server/mcp.ts).
 *
 * Unlike http.ts, which serves one fixed account from environment variables,
 * every session here belongs to the caller: the MCP client sends its own
 * ExcaliDash API key as `Authorization: Bearer exd_...`, and all tool calls run
 * through the regular REST API with that key, so the usual scopes, sharing
 * rules and validation apply unchanged.
 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isInitializeRequest } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { ExcaliDashClient, type Fetch } from "./excalidash.js";
import { createServer as createMcpServer } from "./index.js";

export type EmbeddedMcpOptions = {
  /**
   * Base URL of the ExcaliDash REST API, e.g. `http://127.0.0.1:8000`, or a
   * function that derives it from the request opening the session.
   */
  apiBaseUrl: string | ((req: IncomingMessage) => string);
  /** Extra headers added to every API request made on behalf of a session. */
  internalHeaders?: Record<string, string>;
  maxSessions?: number;
  maxSessionsPerKey?: number;
  sessionIdleMs?: number;
  fetchImpl?: Fetch;
};

export type EmbeddedMcpHandler = {
  /** Handle one request to the MCP endpoint. `body` is the parsed JSON body. */
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void>;
  close(): Promise<void>;
  readonly sessionCount: number;
};

type SessionEntry = {
  transport: NodeStreamableHTTPServerTransport;
  keyHash: Buffer;
  lastSeen: number;
};

const DEFAULT_MAX_SESSIONS = 256;
const DEFAULT_MAX_SESSIONS_PER_KEY = 16;
const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const jsonRpcError = (
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
): void => {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
  );
};

const unauthorized = (res: ServerResponse, message: string): void =>
  jsonRpcError(res, 401, -32001, message, {
    "WWW-Authenticate": 'Bearer realm="excalidash-mcp"',
  });

export const readBearerToken = (
  header: string | string[] | undefined,
): string | null => {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value ?? "");
  return match?.[1] ?? null;
};

const hashKey = (token: string): Buffer =>
  createHash("sha256").update(token).digest();

const sameKey = (a: Buffer, b: Buffer): boolean =>
  a.length === b.length && timingSafeEqual(a, b);

export const createEmbeddedMcpHandler = (
  options: EmbeddedMcpOptions,
): EmbeddedMcpHandler => {
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const maxSessionsPerKey =
    options.maxSessionsPerKey ?? DEFAULT_MAX_SESSIONS_PER_KEY;
  const sessionIdleMs = options.sessionIdleMs ?? DEFAULT_SESSION_IDLE_MS;
  const baseFetch = options.fetchImpl ?? globalThis.fetch;
  const internalHeaders = options.internalHeaders ?? {};
  const fetchImpl: Fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(internalHeaders))
      headers.set(name, value);
    return baseFetch(input, { ...init, headers });
  };
  const clientFor = (req: IncomingMessage, token: string): ExcaliDashClient => {
    const apiBaseUrl =
      typeof options.apiBaseUrl === "function"
        ? options.apiBaseUrl(req)
        : options.apiBaseUrl;
    return new ExcaliDashClient(
      { url: apiBaseUrl, apiBaseUrl, token },
      fetchImpl,
    );
  };

  const sessions = new Map<string, SessionEntry>();

  const closeSession = (id: string): void => {
    const entry = sessions.get(id);
    if (!entry) return;
    sessions.delete(id);
    void entry.transport.close().catch(() => undefined);
  };

  const sweepIdleSessions = (): void => {
    const cutoff = Date.now() - sessionIdleMs;
    for (const [id, entry] of sessions) {
      if (entry.lastSeen <= cutoff) closeSession(id);
    }
  };
  const sweeper = setInterval(
    sweepIdleSessions,
    Math.min(SWEEP_INTERVAL_MS, sessionIdleMs),
  );
  sweeper.unref();

  const sessionsForKey = (keyHash: Buffer): number => {
    let count = 0;
    for (const entry of sessions.values())
      if (sameKey(entry.keyHash, keyHash)) count += 1;
    return count;
  };

  const openSession = async (
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    token: string,
    keyHash: Buffer,
  ): Promise<void> => {
    sweepIdleSessions();
    if (
      sessions.size >= maxSessions ||
      sessionsForKey(keyHash) >= maxSessionsPerKey
    ) {
      jsonRpcError(res, 429, -32000, "Too many active MCP sessions");
      return;
    }

    const client = clientFor(req, token);
    try {
      await client.probe();
    } catch {
      unauthorized(
        res,
        "The API key was rejected. Use an active ExcaliDash API key with at least the drawings:read scope.",
      );
      return;
    }

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      // Plain JSON responses survive reverse proxies that buffer SSE.
      enableJsonResponse: true,
      onsessioninitialized: (id): void => {
        sessions.set(id, { transport, keyHash, lastSeen: Date.now() });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await createMcpServer(client).connect(transport);
    await transport.handleRequest(req, res, body);
  };

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> => {
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-store");

    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      unauthorized(
        res,
        "Missing API key. Send an ExcaliDash API key as 'Authorization: Bearer <key>'.",
      );
      return;
    }
    const keyHash = hashKey(token);

    const rawSessionId = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(rawSessionId)
      ? rawSessionId[0]
      : rawSessionId;
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      // A session is bound to the key that opened it.
      if (!sameKey(existing.keyHash, keyHash)) {
        jsonRpcError(res, 404, -32001, "Session not found");
        return;
      }
      existing.lastSeen = Date.now();
      await existing.transport.handleRequest(req, res, body);
      return;
    }

    if (!sessionId && req.method === "POST" && isInitializeRequest(body)) {
      await openSession(req, res, body, token, keyHash);
      return;
    }

    jsonRpcError(
      res,
      sessionId ? 404 : 400,
      sessionId ? -32001 : -32000,
      sessionId ? "Session not found" : "MCP session initialization required",
    );
  };

  return {
    handle,
    async close(): Promise<void> {
      clearInterval(sweeper);
      const entries = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(entries.map((entry) => entry.transport.close()));
    },
    get sessionCount(): number {
      return sessions.size;
    },
  };
};
