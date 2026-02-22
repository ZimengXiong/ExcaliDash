import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { io as socketIo } from "socket.io-client";
import JSZip from "jszip";

type CsrfInfo = { token: string; header: string; cookie: string };

const resolveApiUrl = () => process.env.API_URL || "http://127.0.0.1:8000";
const resolveBaseUrl = () => process.env.BASE_URL || "http://127.0.0.1:5173";

const parseSetCookiePairs = (raw: string | null): string => {
  if (!raw) return "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/g)
    .map((chunk) => chunk.split(";")[0]?.trim() || "")
    .filter(Boolean)
    .join("; ");
};

const fetchJson = async (input: string, init: RequestInit = {}) => {
  const response = await fetch(input, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data, text };
};

let cachedAuthCookie = "";
let cachedCsrfCookie = "";

const getCsrfInfo = async (cookieHeader?: string): Promise<CsrfInfo> => {
  const headers: Record<string, string> = { origin: resolveBaseUrl() };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const { response, data } = await fetchJson(`${resolveApiUrl()}/csrf-token`, {
    headers,
  });
  if (!response.ok || !data?.token) {
    throw new Error(`Failed to fetch CSRF token: ${response.status}`);
  }
  const cookie = parseSetCookiePairs(response.headers.get("set-cookie"));
  if (cookie) {
    cachedCsrfCookie = cookie;
  }
  return {
    token: data.token,
    header: data.header || "x-csrf-token",
    cookie: cachedCsrfCookie,
  };
};

const ensureAuthEnabled = async () => {
  const { response, data } = await fetchJson(`${resolveApiUrl()}/auth/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch auth status: ${response.status}`);
  }
  if (!data?.authOnboardingRequired) return;
  const csrf = await getCsrfInfo();
  const choice = await fetch(`${resolveApiUrl()}/auth/onboarding-choice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: resolveBaseUrl(),
      [csrf.header]: csrf.token,
      Cookie: csrf.cookie,
    },
    body: JSON.stringify({ enableAuth: true }),
  });
  if (!choice.ok && choice.status !== 409) {
    const text = await choice.text();
    throw new Error(`Failed to enable auth: ${choice.status} ${text}`);
  }
};

const ensureAdminUser = async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const backendRoot = path.join(repoRoot, "backend");
  const dbFileName = `e2e-cypress-${Date.now()}.db`;
  const dbPath = path.join(backendRoot, "prisma", dbFileName);
  try {
    await fs.rm(dbPath, { force: true });
  } catch {
    // ignore cleanup failures
  }

  const backendEnv = {
    ...process.env,
    DATABASE_URL: `file:${dbPath}`,
    FRONTEND_URL: resolveBaseUrl(),
    PORT: process.env.PORT || "8000",
    NODE_ENV: "test",
    AUTH_MODE: "hybrid",
    DISABLE_ONBOARDING_GATE: "true",
    ENABLE_PASSWORD_RESET: "false",
    ENABLE_REFRESH_TOKEN_ROTATION: "false",
    CSRF_MAX_REQUESTS: "10000",
    RATE_LIMIT_MAX_REQUESTS: "100000",
    DOTENV_CONFIG_OVERRIDE: "true",
    DOTENV_CONFIG_PATH: "/dev/null",
  };

  await new Promise<void>((resolve, reject) => {
    const migrate = spawn("npx", ["prisma", "db", "push", "--skip-generate"], {
      cwd: backendRoot,
      env: backendEnv,
      stdio: "inherit",
    });
    migrate.on("error", reject);
    migrate.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`Prisma db push failed with code ${code}`));
        return;
      }
      resolve();
    });
  });

  const seedScript = `const { PrismaClient } = require('./src/generated/client');
const bcrypt = require('bcrypt');
const email = process.env.AUTH_EMAIL || 'admin@example.com';
const username = process.env.AUTH_USERNAME || 'admin';
const password = process.env.AUTH_PASSWORD || 'BddPassword!123';
(async () => {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.systemConfig.upsert({
      where: { id: 'default' },
      update: {
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
      },
      create: {
        id: 'default',
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
        authLoginRateLimitEnabled: true,
        authLoginRateLimitWindowMs: 15 * 60 * 1000,
        authLoginRateLimitMax: 20,
      },
    });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          username,
          passwordHash,
          name: 'BDD Admin',
          role: 'ADMIN',
          mustResetPassword: false,
          isActive: true,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          role: 'ADMIN',
          mustResetPassword: false,
          isActive: true,
          username: existing.username ?? username,
          name: existing.name || 'BDD Admin',
        },
      });
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
})().catch((error) => {
  console.error('Failed to seed auth data', error);
  process.exit(1);
});
`;

  await new Promise<void>((resolve, reject) => {
    const seed = spawn("node", ["-e", seedScript], {
      cwd: backendRoot,
      env: backendEnv,
      stdio: "inherit",
    });
    seed.on("error", reject);
    seed.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`Auth seed failed with code ${code}`));
        return;
      }
      resolve();
    });
  });

  return { dbPath, env: backendEnv };
};

const ensureAuthenticatedSession = async () => {
  if (cachedAuthCookie && cachedCsrfCookie) {
    return { cookieHeader: cachedAuthCookie, csrfCookie: cachedCsrfCookie };
  }
  await ensureAuthEnabled();
  const csrf = await getCsrfInfo();
  const email = process.env.AUTH_EMAIL || "admin@example.com";
  const password = process.env.AUTH_PASSWORD || "BddPassword!123";
  const response = await fetch(`${resolveApiUrl()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: resolveBaseUrl(),
      [csrf.header]: csrf.token,
      Cookie: csrf.cookie,
    },
    body: JSON.stringify({ email, password }),
  });
  const cookieHeader = parseSetCookiePairs(response.headers.get("set-cookie"));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} ${text}`);
  }
  if (cookieHeader) {
    cachedAuthCookie = cookieHeader;
  }
  cachedCsrfCookie = csrf.cookie;
  return { cookieHeader: cachedAuthCookie, csrfCookie: cachedCsrfCookie };
};

const buildCookieHeader = (parts: string[]) =>
  parts
    .map((value) => value.trim())
    .filter(Boolean)
    .join("; ");

const getAuthCookies = async () => {
  const auth = await ensureAuthenticatedSession();
  return buildCookieHeader([auth.cookieHeader, auth.csrfCookie]);
};

const postJson = async (path: string, body: Record<string, unknown>) => {
  const cookieHeader = await getAuthCookies();
  const csrf = await getCsrfInfo(cookieHeader);
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: resolveBaseUrl(),
      [csrf.header]: csrf.token,
      Cookie: buildCookieHeader([cookieHeader, csrf.cookie]),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const putJson = async (path: string, body: Record<string, unknown>) => {
  const cookieHeader = await getAuthCookies();
  const csrf = await getCsrfInfo(cookieHeader);
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      origin: resolveBaseUrl(),
      [csrf.header]: csrf.token,
      Cookie: buildCookieHeader([cookieHeader, csrf.cookie]),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PUT ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const deleteRequest = async (path: string) => {
  const cookieHeader = await getAuthCookies();
  const csrf = await getCsrfInfo(cookieHeader);
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    method: "DELETE",
    headers: {
      origin: resolveBaseUrl(),
      [csrf.header]: csrf.token,
      Cookie: buildCookieHeader([cookieHeader, csrf.cookie]),
    },
  });
  const text = await response.text();
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const getJson = async (path: string) => {
  const cookieHeader = await getAuthCookies();
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    headers: { Cookie: cookieHeader },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const buildBackupZip = async (drawingName: string) => {
  const id = `drawing-${Date.now()}`;
  const manifest = {
    format: "excalidash",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    excalidashBackendVersion: "test",
    unorganizedFolder: "Unorganized",
    collections: [],
    drawings: [
      {
        id,
        name: drawingName,
        collectionId: null,
        filePath: "drawings/drawing-1.json",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const drawingPayload = {
    id,
    name: drawingName,
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
  const zip = new JSZip();
  zip.file("excalidash.manifest.json", JSON.stringify(manifest, null, 2));
  zip.folder("drawings")?.file("drawing-1.json", JSON.stringify(drawingPayload, null, 2));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, drawingPayload };
};

let socketClient: ReturnType<typeof socketIo> | null = null;

const connectSocketClient = async (drawingId: string, cookie: string) => {
  // In Docker, API_URL is http://frontend:80/api but socket.io is served at
  // the root host (nginx proxies /socket.io/ to the backend).
  // Use BASE_URL (http://frontend:80) for socket connections, not API_URL.
  const socketUrl = resolveBaseUrl();
  const user = {
    id: `cypress-${Date.now()}`,
    name: "Cypress Bot",
    initials: "CB",
    color: "#10b981",
  };
  socketClient = socketIo(socketUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
    extraHeaders: {
      Cookie: cookie,
    },
    auth: {
      token: cookie,
    },
    timeout: 15000,
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    if (!socketClient) {
      reject(new Error("Socket client missing"));
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error(`Socket connect timed out after 15s (url: ${socketUrl})`));
    }, 15000);
    socketClient.on("connect", () => {
      socketClient?.emit("join-room", { drawingId, user }, (response: any) => {
        clearTimeout(timer);
        resolve();
      });
      // If join-room ack never fires (access denied), resolve after a brief delay
      // so the test can proceed and check for errors
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 3000);
    });
    socketClient.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Socket connect_error: ${error.message}`));
    });
  });
};

const emitElementUpdate = (drawingId: string, elements: any[], files?: Record<string, any>) => {
  if (!socketClient) throw new Error("Socket client not connected");
  socketClient.emit("element-update", { drawingId, elements, files });
};

const emitCursorMove = (drawingId: string) => {
  if (!socketClient) throw new Error("Socket client not connected");
  socketClient.emit("cursor-move", {
    drawingId,
    pointer: { x: 320, y: 320 },
    button: "up",
    selectedElementIds: {},
  });
};

const disconnectSocket = () => {
  if (socketClient) {
    socketClient.disconnect();
    socketClient = null;
  }
};

export const registerTasks = () => ({
  "auth:ensure": async () => {
    await ensureAuthEnabled();
    return true;
  },
  "auth:login": async () => {
    return ensureAuthenticatedSession();
  },
  "api:get": async ({ path }: { path: string }) => getJson(path),
  "api:post": async ({ path, body }: { path: string; body: Record<string, unknown> }) =>
    postJson(path, body),
  "api:put": async ({ path, body }: { path: string; body: Record<string, unknown> }) =>
    putJson(path, body),
  "api:delete": async ({ path }: { path: string }) => deleteRequest(path),
  "backup:zip": async ({ drawingName }: { drawingName: string }) => buildBackupZip(drawingName),
  "socket:connect": async ({ drawingId, cookie }: { drawingId: string; cookie: string }) => {
    await connectSocketClient(drawingId, cookie);
    return true;
  },
  "socket:element-update": async ({ drawingId, elements, files }: { drawingId: string; elements: any[]; files?: Record<string, any> }) => {
    emitElementUpdate(drawingId, elements, files);
    return true;
  },
  "socket:cursor": async ({ drawingId }: { drawingId: string }) => {
    emitCursorMove(drawingId);
    return true;
  },
  "socket:disconnect": async () => {
    disconnectSocket();
    return true;
  },
  "db:seed": async () => ensureAdminUser(),
});
