import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const image = process.argv[2];
if (!image || process.argv.length !== 3)
  throw new Error(
    "usage: node scripts/check-image-startup.mjs <backend-image>",
  );
const docker = (...args) => {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    // Docker errors can repeat command arguments containing test secrets.
    throw new Error(`docker ${args[0]} failed`);
  }
};
let container;
try {
  // No host ports, external network, bind mounts, or persistent volumes.
  container = docker(
    "run",
    "--detach",
    "--pull=never",
    "--network=none",
    "--tmpfs",
    "/app/prisma:uid=1001,gid=1001,mode=0700",
    "--tmpfs",
    "/app/uploads:uid=1001,gid=1001,mode=0700",
    "--env",
    "NODE_ENV=production",
    "--env",
    "AUTH_MODE=local",
    "--env",
    "DATABASE_URL=file:/app/prisma/dev.db",
    "--env",
    "FRONTEND_URL=https://first.example.test,https://second.example.test",
    "--env",
    "TRUST_PROXY=1",
    "--env",
    "UPDATE_CHECK_OUTBOUND=false",
    "--env",
    `JWT_SECRET=${randomBytes(32).toString("hex")}`,
    "--env",
    `CSRF_SECRET=${randomBytes(32).toString("hex")}`,
    "--env",
    "API_KEY_HASH_PEPPER=image-smoke-test",
    image,
  );
  if (!/^[a-f0-9]{64}$/.test(container))
    throw new Error("Unexpected Docker container ID");
  const healthCode =
    "fetch('http://127.0.0.1:8000/health', {redirect:'manual', signal:AbortSignal.timeout(1000)}).then(async r=>{if(r.status!==200||(await r.json()).database!=='ok')process.exitCode=1}).catch(()=>{process.exitCode=1})";
  const deadline = Date.now() + 60000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (
      docker("inspect", "--format", "{{.State.Running}}", container) !== "true"
    )
      throw new Error("Offline startup exited before becoming healthy");
    try {
      docker("exec", container, "node", "-e", healthCode);
      healthy = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!healthy)
    throw new Error("Offline startup did not become healthy within 60 seconds");
  if (docker("exec", container, "id", "-u") !== "1001")
    throw new Error("Backend is not running as UID 1001");
  docker(
    "exec",
    container,
    "node",
    "-e",
    "fetch('http://127.0.0.1:8000/drawings',{redirect:'manual',headers:{'X-Forwarded-Proto':'https'},signal:AbortSignal.timeout(1000)}).then(r=>{if(r.status!==409)throw new Error('Expected onboarding gate, got '+r.status)}).catch(e=>{console.error(e.message);process.exitCode=1})",
  );
  console.log(
    "Offline startup, database readiness, production health, non-root ownership, and onboarding checks passed.",
  );
} catch (error) {
  if (container && /^[a-f0-9]{64}$/.test(container)) {
    // Startup logs can include a bootstrap code; do not emit them into CI.
    console.error(
      `Container state: ${docker("inspect", "--format", "{{.State.Status}} / {{.State.ExitCode}}", container)}`,
    );
  }
  throw error;
} finally {
  if (container && /^[a-f0-9]{64}$/.test(container))
    docker("rm", "--force", container);
}
