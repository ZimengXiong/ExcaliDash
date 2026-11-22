import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const nginx = read("frontend/nginx.conf.template");
const listenPorts = [...nginx.matchAll(/\blisten\s+(\d+)\s*;/g)].map((match) =>
  Number(match[1]),
);
// Expand YAML anchors using Compose itself; do not start any services.
const { services } = JSON.parse(
  execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      "/dev/null",
      "-f",
      "docker-compose.lab.yml",
      "config",
      "--format",
      "json",
    ],
    { cwd: root, encoding: "utf8" },
  ),
);
const frontends = {
  "frontend-basic": "1101",
  "frontend-basic-seaweed": "1102",
  "frontend-oidc": "1103",
  "frontend-hybrid": "1104",
  "frontend-trusted-proxy": "1105",
};

test("lab frontends use the unprivileged nginx listener and runtime config", () => {
  assert.deepEqual(listenPorts, [80, 8080]);
  const dockerfile = read("frontend/Dockerfile");
  assert.match(dockerfile, /^EXPOSE 80 8080$/m);
  assert.match(dockerfile, /CMD \["nginx", "-c", "\/tmp\/nginx.conf"/);
  assert.match(
    read("frontend/docker-entrypoint.sh"),
    /nginx -t -c \/tmp\/nginx.conf/,
  );
  assert.deepEqual(
    Object.keys(services)
      .filter((name) => name.startsWith("frontend-"))
      .sort(),
    Object.keys(frontends).sort(),
  );
});

test("nginx forwards the incoming Host including its port for API and Socket.IO requests", () => {
  for (const location of ["/api/", "/socket.io/"]) {
    const start = nginx.indexOf(`location ${location} {`);
    assert.notEqual(start, -1);
    const block = nginx.slice(start, nginx.indexOf("}", start));
    assert.match(block, /proxy_set_header Host \$http_host;/);
  }
});

for (const [name, hostPort] of Object.entries(frontends)) {
  test(`${name} publishes ${hostPort} to nginx and checks the same listener`, () => {
    const service = services[name];
    assert.equal(service.build.dockerfile, "frontend/Dockerfile");
    assert.equal(service.ports.length, 1);
    assert.equal(service.ports[0].published, hostPort);
    const listenPort = service.ports[0].target;
    assert.ok(listenPorts.includes(listenPort));
    assert.equal(service.ports[0].protocol, "tcp");
    assert.ok(
      service.healthcheck.test.includes(`http://127.0.0.1:${listenPort}`),
    );
    const backend = name.replace(/^frontend-/, "backend-");
    assert.equal(service.environment.BACKEND_URL, `${backend}:8000`);
    assert.ok(service.depends_on[backend]);
    assert.ok(service.networks);
    assert.ok(
      Object.keys(service.networks).some((network) =>
        Object.hasOwn(services[backend].networks, network),
      ),
    );
  });
}
