import { ChildProcess, spawn } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";

const processes: ChildProcess[] = [];

const waitFor = async (url: string, timeoutMs = 120000) => {
  const startedAt = Date.now();
  const okStatuses = new Set([200, 400, 401, 403, 404, 405]);
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (okStatuses.has(response.status)) return;
    } catch {
      // Ignore until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const canListen = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });

const isPortAvailable = async (port: number): Promise<boolean> => {
  const ipv4Available = await canListen(port, "0.0.0.0");
  if (!ipv4Available) return false;
  const ipv6Available = await canListen(port, "::");
  return ipv6Available;
};

const findAvailablePort = async (start: number, attempts = 10): Promise<number> => {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = start + offset;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting at ${start}`);
};

const buildEnv = (extra: Record<string, string>) => ({
  ...process.env,
  ...extra,
});

export const startServers = async () => {
  if (process.env.NO_SERVER === "true") return;
  const running = processes.filter((proc) => !proc.killed && proc.exitCode === null);
  if (running.length > 0) return;
  processes.length = 0;

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const apiPort = process.env.API_URL
    ? Number(new URL(process.env.API_URL).port || 8000)
    : 8000;
  const frontendPort = process.env.BASE_URL
    ? Number(new URL(process.env.BASE_URL).port || 5173)
    : 5173;

  const resolvedApiPort = await findAvailablePort(apiPort, 5);
  const resolvedFrontendPort = await findAvailablePort(frontendPort, 15);

  const apiUrl = `http://127.0.0.1:${resolvedApiPort}`;
  const frontendUrl = `http://127.0.0.1:${resolvedFrontendPort}`;

  process.env.API_URL = apiUrl;
  process.env.BASE_URL = frontendUrl;

  const dbFileName = `e2e-test-${Date.now()}.db`;
  const dbPath = path.join(repoRoot, "backend", "prisma", dbFileName);
  try {
    fs.rmSync(dbPath, { force: true });
  } catch {
    // ignore cleanup failures
  }

  const backendEnv = buildEnv({
    DATABASE_URL: `file:${dbPath}`,
    FRONTEND_URL: frontendUrl,
    PORT: String(resolvedApiPort),
    NODE_ENV: "test",
    AUTH_MODE: "hybrid",
    DISABLE_ONBOARDING_GATE: "true",
    ENABLE_PASSWORD_RESET: "false",
    ENABLE_REFRESH_TOKEN_ROTATION: "false",
    CSRF_MAX_REQUESTS: "10000",
    RATE_LIMIT_MAX_REQUESTS: "100000",
    DOTENV_CONFIG_OVERRIDE: "true",
    DOTENV_CONFIG_PATH: "/dev/null",
    TS_NODE_PROJECT: path.join(repoRoot, "backend", "tsconfig.json"),
    NODE_OPTIONS: "--dns-result-order=ipv4first --no-warnings",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  });

  const migrateProcess = spawn("npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: path.join(repoRoot, "backend"),
    env: backendEnv,
    stdio: "inherit",
  });

  await new Promise<void>((resolve, reject) => {
    migrateProcess.on("error", reject);
    migrateProcess.on("exit", (code) => {
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

  const seedProcess = spawn("node", ["-e", seedScript], {
    cwd: path.join(repoRoot, "backend"),
    env: backendEnv,
    stdio: "inherit",
  });

  await new Promise<void>((resolve, reject) => {
    seedProcess.on("error", reject);
    seedProcess.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`Auth seed failed with code ${code}`));
        return;
      }
      resolve();
    });
  });

  const backendProcess = spawn("npm", ["run", "dev"], {
    cwd: path.join(repoRoot, "backend"),
    env: backendEnv,
    stdio: "inherit",
  });

  backendProcess.on("exit", (code, signal) => {
    console.error("Backend process exited", { code, signal });
  });

  backendProcess.on("error", (error) => {
    console.error("Backend process error", error);
  });

  const frontendProcess = spawn(
    "npm",
    ["run", "dev", "--", "--host", "0.0.0.0", "--port", String(resolvedFrontendPort), "--strictPort"],
    {
      cwd: path.join(repoRoot, "frontend"),
      env: buildEnv({
        VITE_API_URL: apiUrl,
        NODE_OPTIONS: "--dns-result-order=ipv4first --no-warnings",
      }),
      stdio: "inherit",
    }
  );

  frontendProcess.on("exit", (code, signal) => {
    console.error("Frontend process exited", { code, signal });
  });

  frontendProcess.on("error", (error) => {
    console.error("Frontend process error", error);
  });

  processes.push(backendProcess, frontendProcess);

  await waitFor(`${apiUrl}/health`, 120000);
  await waitFor(frontendUrl, 180000);
};

export const stopServers = async () => {
  if (process.env.NO_SERVER === "true") return;
  for (const processHandle of processes.splice(0)) {
    if (processHandle.killed) continue;
    processHandle.kill("SIGTERM");
  }
};
