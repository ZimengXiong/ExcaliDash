// Drives drawing saves against a backend on 127.0.0.1:8000 the way the editor
// autosave does, and prints phase markers (epoch seconds) for bench.sh.
const fs = require("fs");

const [previewsPath] = process.argv.slice(2);
const SAVES = Number(process.env.SAVES || 200);
const IDLE_BEFORE_S = 20;
const IDLE_AFTER_S = 30;
const BASE = "http://127.0.0.1:8000";
const ORIGIN = "http://localhost";

// a JSON array of SVG strings, or rows with a `preview` field (sqlite3 -json output)
const previews = JSON.parse(fs.readFileSync(previewsPath, "utf8")).map((row) =>
  typeof row === "string" ? row : row.preview,
);

let cookie = "";
const request = async (method, path, body, headers = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
      ...headers,
    },
    body: body && JSON.stringify(body),
  });
  const setCookies = res.headers.getSetCookie?.() || [];
  if (setCookies.length)
    cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, body: await res.text() };
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const phase = (name) =>
  console.log(`PHASE ${name} ${Math.floor(Date.now() / 1000)}`);

(async () => {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await request("GET", "/api/health")).status === 200) break;
    } catch {
      // the backend is still starting
    }
    await sleep(1000);
  }
  phase("idle");
  await sleep(IDLE_BEFORE_S * 1000);

  const csrf = JSON.parse((await request("GET", "/api/csrf-token")).body);
  const headers = { [csrf.header]: csrf.token };
  const created = await request(
    "POST",
    "/api/drawings",
    {
      name: "bench",
      elements: [],
      appState: {},
      files: {},
      preview: previews[0],
    },
    headers,
  );
  if (created.status >= 300)
    throw new Error(`create: ${created.status} ${created.body.slice(0, 300)}`);
  const { id } = JSON.parse(created.body);

  phase("saves");
  const times = [];
  for (let i = 0; i < SAVES; i++) {
    const started = Date.now();
    const res = await request(
      "PUT",
      `/api/drawings/${id}`,
      {
        elements: [],
        appState: {},
        files: {},
        preview: previews[i % previews.length],
      },
      headers,
    );
    times.push(Date.now() - started);
    if (res.status >= 300)
      throw new Error(`save ${i}: ${res.status} ${res.body.slice(0, 300)}`);
  }
  times.sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  console.log(
    `SAVES median ${times[times.length >> 1]} p95 ${times[Math.floor(times.length * 0.95)]} total ${total}`,
  );

  phase("after");
  await sleep(IDLE_AFTER_S * 1000);
  phase("done");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
