import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function startRuntimeServer(
  overrides: NodeJS.ProcessEnv = {},
  nodeArgs: string[] = [],
) {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const cwd = path.resolve(__dirname, "../..");
  const child = spawn(
    process.execPath,
    [...nodeArgs, "-r", "ts-node/register/transpile-only", "src/index.ts"],
    {
      cwd,
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: "production",
        AUTH_MODE: "local",
        PORT: String(port),
        LISTEN_HOST: "127.0.0.1",
        FRONTEND_URL: "https://first.example.test,https://second.example.test",
        JWT_SECRET: randomBytes(32).toString("hex"),
        CSRF_SECRET: randomBytes(32).toString("hex"),
        API_KEY_HASH_PEPPER: "runtime-test-pepper",
        UPDATE_CHECK_OUTBOUND: "false",
        MAIL_TRANSPORT: "none",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + chunk).slice(-8000);
  });
  child.stderr.on("data", (chunk) => {
    output = (output + chunk).slice(-8000);
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error(`Runtime server exited: ${output}`);
      try {
        const response = await fetch(`${url}/health`, {
          redirect: "manual",
          signal: AbortSignal.timeout(500),
        });
        if (response.status === 200) return { url, stop };
      } catch {
        /* Startup is still in progress. */
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Runtime server did not become healthy: ${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
