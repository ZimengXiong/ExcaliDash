import { chromium } from "../e2e/node_modules/playwright/index.mjs";
import { buildGallery } from "./marketing-gallery.mjs";
import { captureCollaboration } from "./marketing-collaboration.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Run node scripts/marketing-start.mjs first, then this script.
// Sources are pinned. Generated scenes, notices, manifest and captures stay together.
const base = "http://127.0.0.1:6777";
const out = resolve(import.meta.dirname, "../artifacts/marketing");
const gallery = resolve(out, "gallery");
await mkdir(gallery, { recursive: true });
await mkdir(resolve(out, "sources"), { recursive: true });
const repos = {
  libraries: [
    "excalidraw/excalidraw-libraries",
    "297a349eaff859e678f78d4dbc8e68df5fce42e5",
    "MIT",
    "LICENSE",
  ],
  systems: [
    "Prakash-sa/system-design-ultimatum",
    "018c1244c9273cbb62f4fa174a15e2fffc89c509",
    "CC BY 4.0 (diagrams)",
    "LICENSE.md",
  ],
  redis: [
    "vemuruadi/excalidraw-redis-grafana",
    "8f51501158d4bfa3f3dbd089a0aade9359d12ecb",
    "MIT",
    "LICENSE",
  ],
  arete: [
    "aretecode/system-design-templates-excalidraw",
    "8dafdf3dea3f5a04688b9226a7c0d83a7eb33071",
    "MIT",
    "LICENSE",
  ],
};
const samples = [
  [
    "systems",
    "🧩 1. Foundational(Introductory) Design/Load Balancer.excalidraw",
    "Load balancing architecture",
    "System design",
  ],
  [
    "systems",
    "🧩 1. Foundational(Introductory) Design/DNS.excalidraw",
    "DNS resolution",
    "System design",
  ],
  [
    "systems",
    "🧩 1. Foundational(Introductory) Design/Database Strategies.excalidraw",
    "Database strategies",
    "System design",
  ],
  [
    "systems",
    "🧠 7. Analytics, Streaming, and Data Pipelines/Log Aggregation.excalidraw",
    "Log aggregation",
    "Data & observability",
  ],
  [
    "systems",
    "💬 3. Social & Communication Systems/Global Notification Service.excalidraw",
    "Notification service",
    "System design",
  ],
  [
    "systems",
    "💬 3. Social & Communication Systems/Chat System(Messaging).excalidraw",
    "Messaging architecture",
    "System design",
  ],
  [
    "systems",
    "☁️ 11. Deployment Strategies/blue_green_deployment.excalidraw",
    "Blue-green deployment",
    "Platform engineering",
  ],
  [
    "systems",
    "☁️ 11. Deployment Strategies/canary_deployment.excalidraw",
    "Canary rollout",
    "Platform engineering",
  ],
  [
    "systems",
    "☁️ 11. Deployment Strategies/rolling_deployment.excalidraw",
    "Rolling deployment",
    "Platform engineering",
  ],
  [
    "systems",
    "☁️ 11. Deployment Strategies/feature_flag_deployment.excalidraw",
    "Feature flag rollout",
    "Platform engineering",
  ],
  [
    "redis",
    "drawings/real-time-data-pipelines.excalidraw",
    "Real-time data pipelines",
    "Data & observability",
  ],
  [
    "redis",
    "drawings/grafana-dashboard.excalidraw",
    "Grafana dashboard",
    "Data & observability",
  ],
  [
    "redis",
    "redis-grafana.excalidraw",
    "Redis + Grafana architecture",
    "Data & observability",
  ],
  [
    "libraries",
    "libraries/braweria/customer-journey-map.excalidrawlib",
    "Customer journey workshop",
    "Product discovery",
  ],
  [
    "libraries",
    "libraries/danimaniarqsoft/scrum-board.excalidrawlib",
    "Sprint planning board",
    "Product discovery",
  ],
  [
    "libraries",
    "libraries/ferminrp/post-it.excalidrawlib",
    "Team retrospective",
    "Product discovery",
  ],
  [
    "libraries",
    "libraries/gabrielamacakova/basic-ux-wireframing-elements.excalidrawlib",
    "UX wireframe toolkit",
    "Interface design",
  ],
  [
    "libraries",
    "libraries/excacomp/mobile-kit.excalidrawlib",
    "Mobile app patterns",
    "Interface design",
  ],
  [
    "libraries",
    "libraries/excacomp/web-kit.excalidrawlib",
    "Web interface patterns",
    "Interface design",
  ],
  [
    "libraries",
    "libraries/datavizfairy/dashboard-charts.excalidrawlib",
    "Analytics dashboard charts",
    "Data & observability",
  ],
  [
    "libraries",
    "libraries/dmitry-burnyshev/c4-architecture.excalidrawlib",
    "C4 architecture toolkit",
    "Architecture library",
  ],
  [
    "libraries",
    "libraries/dwelle/network-topology-icons.excalidrawlib",
    "Network topology",
    "Architecture library",
  ],
  [
    "libraries",
    "libraries/anna-pastushko/architecture-diagram-components.excalidrawlib",
    "Service architecture components",
    "Architecture library",
  ],
  [
    "libraries",
    "libraries/aretecode/decision-flow-control.excalidrawlib",
    "Decision flow patterns",
    "Architecture library",
  ],
  [
    "arete",
    "src/system-design-template-emoji.excalidrawlib",
    "System design workshop",
    "Architecture library",
  ],
];
async function download(key, path) {
  const [repo, commit] = repos[key];
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return { text: await response.text(), url };
}
const notices = [];
for (const [key, [repo, commit, license, licensePath]] of Object.entries(
  repos,
)) {
  const source = await download(key, licensePath);
  notices.push(
    `${repo}\nRevision: ${commit}\nLicense: ${license}\n${source.url}\n\n${source.text}`,
  );
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(base);
  await page
    .getByRole("heading", { name: "All Drawings", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    performance
      .getEntriesByType("resource")
      .some((e) => e.name.includes("@excalidraw_excalidraw.js")),
  );
  const moduleUrl = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .find((e) => e.name.includes("@excalidraw_excalidraw.js")).name,
  );
  const csrf = await (
    await context.request.get(`${base}/api/csrf-token`)
  ).json();
  async function api(path, data, method = "POST") {
    const response = await context.request.fetch(`${base}/api${path}`, {
      method,
      data,
      headers: { [csrf.header || "x-csrf-token"]: csrf.token },
    });
    if (!response.ok())
      throw new Error(`${method} ${path}: ${await response.text()}`);
    return response.json();
  }
  const collections = await api("/collections", undefined, "GET");
  const drawingResponse = await api(
    "/drawings?includeData=false",
    undefined,
    "GET",
  );
  const drawings = Array.isArray(drawingResponse)
    ? drawingResponse
    : drawingResponse.drawings;
  const collectionMap = new Map(collections.map((c) => [c.name, c.id]));
  const captureOnly = process.argv.includes("--capture-only");
  const manifest = captureOnly
    ? JSON.parse(await readFile(resolve(out, "manifest.json"), "utf8"))
    : [];
  for (const [key, path, title, folder] of captureOnly ? [] : samples) {
    console.log(`Rendering ${title}`);
    const source = await download(key, path);
    const scene = JSON.parse(source.text);
    const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await writeFile(resolve(out, "sources", `${filename}.json`), source.text);
    const rendered = await page.evaluate(
      async ({ scene, moduleUrl }) => {
        const ex = await import(moduleUrl);
        let elements;
        if (scene.elements) elements = ex.restoreElements(scene.elements, null);
        else {
          // Preserve each sample's internal geometry and bindings; arrange the library
          // as an editable contact sheet with Excalidraw's own restore/export pipeline.
          const items = (scene.libraryItems || scene.library).slice(0, 12);
          elements = [];
          items.forEach((item, i) => {
            const restored = ex.restoreElements(item.elements || item, null);
            const [x1, y1, x2, y2] = ex.getCommonBounds(restored);
            const scale = Math.min(
              650 / Math.max(x2 - x1, 1),
              420 / Math.max(y2 - y1, 1),
            );
            for (const el of restored) {
              const result = {
                ...el,
                id: `${i}-${el.id}`,
                x: (el.x - x1) * scale + (i % 3) * 740,
                y: (el.y - y1) * scale + Math.floor(i / 3) * 510,
                width: el.width * scale,
                height: el.height * scale,
                groupIds: (el.groupIds || []).map((id) => `${i}-${id}`),
                containerId: el.containerId ? `${i}-${el.containerId}` : null,
                boundElements: el.boundElements?.map((b) => ({
                  ...b,
                  id: `${i}-${b.id}`,
                })),
              };
              if (el.fontSize) result.fontSize = el.fontSize * scale;
              if (el.points)
                result.points = el.points.map(([x, y]) => [
                  x * scale,
                  y * scale,
                ]);
              for (const key of ["startBinding", "endBinding"])
                if (el[key])
                  result[key] = {
                    ...el[key],
                    elementId: `${i}-${el[key].elementId}`,
                  };
              elements.push(result);
            }
          });
        }
        elements = elements.filter((e) => !e.isDeleted);
        const files = scene.files || {};
        const appState = {
          viewBackgroundColor: "#ffffff",
          exportBackground: true,
          exportWithDarkMode: false,
        };
        const svg = await ex.exportToSvg({
          elements,
          files,
          appState,
          exportPadding: 30,
        });
        await document.fonts.ready;
        return { elements, files, appState, preview: svg.outerHTML };
      },
      { scene, moduleUrl },
    );
    if (!collectionMap.has(folder))
      collectionMap.set(
        folder,
        (await api("/collections", { name: folder })).id,
      );
    const payload = {
      name: title,
      collectionId: collectionMap.get(folder),
      ...rendered,
    };
    const existing = drawings.find(
      (d) => d.name === title && d.collectionId === payload.collectionId,
    );
    const saved = await api(
      existing ? `/drawings/${existing.id}` : "/drawings",
      payload,
      existing ? "PUT" : "POST",
    );
    manifest.push({
      title,
      folder,
      id: saved.id,
      source: source.url,
      license: repos[key][2],
      modification: scene.elements
        ? "Restored with Excalidraw; white export background."
        : "First twelve library items arranged and scaled into an editable contact sheet.",
    });
  }
  await writeFile(
    resolve(gallery, "sources.json"),
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    resolve(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    resolve(gallery, "CREDITS.txt"),
    notices.join("\n\n--------------------\n\n") +
      "\n\nPer-image source and modifications: sources.json\nCC BY 4.0: https://creativecommons.org/licenses/by/4.0/\n",
  );
  const captures = [];
  async function capture(name, url, width = 1600, height = 1050) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}${url}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);
    if (!url.startsWith("/editor")) {
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[data-testid^="select-drawing-"]').length >
          0,
      );
      await page.waitForFunction(
        () => document.querySelectorAll("svg[viewBox] text").length > 0,
      );
    } else {
      await page.locator(".excalidraw canvas").first().waitFor();
      await page
        .locator(".excalidraw canvas")
        .last()
        .click({ position: { x: 650, y: 450 } });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Shift+Digit1");
      await page.waitForTimeout(1200);
    }
    await page.mouse.move(
      url.startsWith("/editor") ? 30 : width - 5,
      url.startsWith("/editor") ? 2 : height - 5,
    );
    await page.waitForTimeout(200);
    if (await page.locator('[data-sonner-toast][data-type="error"]').count()) {
      throw new Error(`Capture ${name} has an error toast`);
    }
    await page.screenshot({
      path: resolve(gallery, `${name}.png`),
      animations: "disabled",
    });
    captures.push(name);
    console.log(`Captured ${name}`);
  }
  await page.evaluate(() =>
    localStorage.setItem(
      "excalidash-preferences",
      JSON.stringify({
        dashboardSortField: "name",
        dashboardSortDirection: "asc",
        theme: "dark",
      }),
    ),
  );
  await capture("01-workspace", "/");
  await capture(
    "02-platform-engineering",
    `/collections?id=${collectionMap.get("Platform engineering")}`,
  );
  await capture(
    "03-interface-design",
    `/collections?id=${collectionMap.get("Interface design")}`,
  );
  await capture(
    "04-data-observability",
    `/collections?id=${collectionMap.get("Data & observability")}`,
  );
  await capture(
    "05-deployment-editor",
    `/editor/${manifest.find((d) => d.title === "Blue-green deployment").id}`,
  );
  await capture(
    "06-pipeline-editor",
    `/editor/${manifest.find((d) => d.title === "Real-time data pipelines").id}`,
  );
  await capture("07-tablet-workspace", "/", 1024, 1100);
  await capture("08-mobile-workspace", "/", 430, 932);
  await page.evaluate(() =>
    localStorage.setItem(
      "excalidash-preferences",
      JSON.stringify({
        dashboardSortField: "name",
        dashboardSortDirection: "asc",
        theme: "dark",
      }),
    ),
  );
  await capture("09-dark-workspace", "/");
  await page.evaluate(() =>
    localStorage.setItem(
      "excalidash-preferences",
      JSON.stringify({
        dashboardSortField: "name",
        dashboardSortDirection: "asc",
        theme: "dark",
      }),
    ),
  );
  for (const theme of ["dark", "light"]) {
    captures.push(
      ...(await captureCollaboration(browser, base, gallery, manifest, {
        theme,
      })),
    );
  }
  await buildGallery(gallery, captures);
} finally {
  await browser.close();
}
