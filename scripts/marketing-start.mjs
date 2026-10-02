import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

// Isolated database and ports; never touches the normal development database.
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "artifacts/marketing");
mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: `file:${output}/demo.db`,
  NODE_ENV: "development",
  AUTH_MODE: "disabled",
  EXCALIDASH_DEV_SINGLE_USER: "true",
  PORT: "8107",
  FRONTEND_URL: "http://127.0.0.1:6777",
  JWT_SECRET: randomBytes(32).toString("hex"),
  CSRF_SECRET: randomBytes(32).toString("hex"),
  UPDATE_CHECK_OUTBOUND: "false",
  RATE_LIMIT_MAX_REQUESTS: "100000",
  CSRF_MAX_REQUESTS: "100000",
  VITE_DEV_BACKEND_URL: "http://127.0.0.1:8107",
};
const children = [
  spawn("npm", ["run", "dev"], {
    cwd: resolve(root, "backend"),
    env,
    stdio: "inherit",
  }),
  spawn(
    "npm",
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      "6777",
      "--strictPort",
    ],
    { cwd: resolve(root, "frontend"), env, stdio: "inherit" },
  ),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((child) => child.kill(signal));
  });
