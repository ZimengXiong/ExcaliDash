import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { owner, viewer } from "../fixtures/auth";
import { openAccountMenu } from "./helpers/sidebar";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
  getDrawing,
  listDrawings,
} from "./helpers/api";

async function signIn(page: Page, identity = owner) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByPlaceholder("Search drawings...")).toBeVisible();
}

async function apiSignIn(request: APIRequestContext) {
  const response = await request.post(`${API_URL}/auth/login`, {
    headers: await getCsrfHeaders(request),
    data: { email: owner.email, password: owner.password },
  });
  expect(response.status()).toBe(200);
}

test("login rejects a bad password, survives reload, and logout blocks private access", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "create a new account" }),
  ).toHaveCount(0);
  await page.getByLabel("Email address", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  const rejected = page.waitForResponse((r) => r.url().endsWith("/auth/login"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await rejected).status()).toBe(401);
  await expect(page.locator(".ui-alert-error")).toBeVisible();

  await signIn(page);
  const drawing = await createDrawing(page.request, {
    name: "Private session drawing",
  });
  try {
    await page.reload();
    await expect(page.getByPlaceholder("Search drawings...")).toBeVisible();
    expect((await page.request.get(`${API_URL}/auth/me`)).status()).toBe(200);
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Logout", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      (await page.request.get(`${API_URL}/drawings/${drawing.id}`)).status(),
    ).toBe(404); // Private drawing routes deliberately conceal existence.
    expect((await page.request.get(`${API_URL}/auth/me`)).status()).toBe(401);
    await page.goto(`/editor/${drawing.id}`);
    await expect(
      page.getByRole("heading", { name: "Unable to open drawing" }),
    ).toBeVisible();
    await expect(
      page.locator("canvas.excalidraw__canvas.interactive"),
    ).toHaveCount(0);
  } finally {
    await apiSignIn(request);
    await deleteDrawing(request, drawing.id);
  }
});

test("a viewer cannot discover private drawings, edit a view-only share, or retain revoked access", async ({
  page,
  request,
}) => {
  await apiSignIn(request);
  const drawing = await createDrawing(request, {
    name: `Private ACL ${Date.now()}`,
  });
  try {
    await signIn(page, viewer);
    expect((await listDrawings(page.request)).map((d) => d.id)).not.toContain(
      drawing.id,
    );
    expect(
      (await page.request.get(`${API_URL}/drawings/${drawing.id}`)).status(),
    ).toBe(404);

    const grant = await request.post(
      `${API_URL}/drawings/${drawing.id}/permissions`,
      {
        headers: await getCsrfHeaders(request),
        data: { granteeUserId: viewer.id, permission: "view" },
      },
    );
    expect(grant.ok()).toBe(true);
    const { permission } = await grant.json();
    await page.goto(`/editor/${drawing.id}`);
    await expect(
      page.locator("canvas.excalidraw__canvas.interactive"),
    ).toBeVisible();
    expect((await getDrawing(page.request, drawing.id)).name).toBe(
      drawing.name,
    );
    const edit = await page.request.put(`${API_URL}/drawings/${drawing.id}`, {
      headers: await getCsrfHeaders(page.request),
      data: { name: "unauthorized overwrite", version: drawing.version },
    });
    expect(edit.status()).toBe(404); // Writes conceal inaccessible drawings too.
    expect((await getDrawing(request, drawing.id)).name).toBe(drawing.name);

    const revoke = await request.delete(
      `${API_URL}/drawings/${drawing.id}/permissions/${permission.id}`,
      { headers: await getCsrfHeaders(request) },
    );
    expect(revoke.ok()).toBe(true);
    expect(
      (await page.request.get(`${API_URL}/drawings/${drawing.id}`)).status(),
    ).toBe(404);
    await page.reload();
    await expect(
      page.getByText(/Drawing (not found|does not exist)/).first(),
    ).toBeVisible();
    await expect(
      page.locator("canvas.excalidraw__canvas.interactive"),
    ).toHaveCount(0);
    expect((await listDrawings(page.request)).map((d) => d.id)).not.toContain(
      drawing.id,
    );
  } finally {
    await deleteDrawing(request, drawing.id);
  }
});

test("theme preference survives a fresh browser context without local storage", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page);
  const before = await page.request.get(`${API_URL}/auth/preferences`);
  expect(before.ok()).toBe(true);
  const originalTheme: string =
    (await before.json()).preferences.theme ?? "system";

  await page.goto("/settings");
  const themeSelect = page.getByRole("button", { name: "Theme", exact: true });
  await expect(themeSelect).toBeVisible();
  const wasDark = await page
    .locator("html")
    .evaluate((el) => el.classList.contains("dark"));
  const expectedTheme = wasDark ? "light" : "dark";
  const expectedLabel = wasDark ? "Light" : "Dark";
  await themeSelect.click();
  await page.getByRole("option", { name: expectedLabel, exact: true }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`${API_URL}/auth/preferences`);
      expect(response.ok()).toBe(true);
      return (await response.json()).preferences.theme;
    })
    .toBe(expectedTheme);

  const fresh = await browser.newContext({
    baseURL,
    storageState: { cookies: await page.context().cookies(), origins: [] },
  });
  try {
    const otherPage = await fresh.newPage();
    await otherPage.goto("/settings");
    await expect(
      otherPage.getByRole("button", { name: "Theme", exact: true }),
    ).toHaveText(expectedLabel);
  } finally {
    await fresh.close();
    const restored = await page.request.put(`${API_URL}/auth/preferences`, {
      headers: await getCsrfHeaders(page.request),
      data: { theme: originalTheme },
    });
    expect(restored.ok()).toBe(true);
  }
});

test("a rejected stale save leaves the accepted scene and version intact", async ({
  request,
}) => {
  await apiSignIn(request);
  const drawing = await createDrawing(request, {
    name: "Concurrent editor guard",
  });
  try {
    const headers = await getCsrfHeaders(request);
    const accepted = await request.put(`${API_URL}/drawings/${drawing.id}`, {
      headers,
      data: {
        version: drawing.version,
        elements: [
          {
            id: "winner",
            type: "rectangle",
            x: 10,
            y: 10,
            width: 80,
            height: 50,
          },
        ],
      },
    });
    expect(accepted.ok()).toBe(true);
    const current = await accepted.json();
    const stale = await request.put(`${API_URL}/drawings/${drawing.id}`, {
      headers,
      data: { version: drawing.version, elements: [] },
    });
    expect(stale.status()).toBe(409);
    const saved = await getDrawing(request, drawing.id);
    expect(saved.version).toBe(current.version);
    expect(saved.elements?.map((element) => element.id)).toEqual(["winner"]);
  } finally {
    await deleteDrawing(request, drawing.id);
  }
});

test("compact account menu hides email and persists its display preference", async ({
  page,
}) => {
  await signIn(page);
  const preferences = await page.request.get(`${API_URL}/auth/preferences`);
  const before = (await preferences.json()).preferences.compactSidebar ?? true;
  try {
    await page.goto("/settings");
    const toggle = page.getByRole("switch", { name: "Toggle compact sidebar" });
    if ((await toggle.getAttribute("aria-checked")) !== "true")
      await toggle.click();
    await expect(
      page.getByRole("button", { name: "Account menu", exact: true }),
    ).toBeVisible();
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText(owner.email, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      sidebar.getByRole("button", { name: "Trash", exact: true }),
    ).toBeHidden();
    await openAccountMenu(page);
    await expect(
      sidebar.getByRole("button", { name: "Trash", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      sidebar.getByRole("button", { name: "Trash", exact: true }),
    ).toBeHidden();
    await toggle.click();
    await expect
      .poll(async () => {
        const result = await page.request.get(`${API_URL}/auth/preferences`);
        return (await result.json()).preferences.compactSidebar;
      })
      .toBe(false);
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(
      sidebar.getByRole("button", { name: "Trash", exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText(owner.email, { exact: true })).toHaveCount(
      0,
    );
  } finally {
    const restored = await page.request.put(`${API_URL}/auth/preferences`, {
      headers: await getCsrfHeaders(page.request),
      data: { compactSidebar: before },
    });
    expect(restored.ok()).toBe(true);
  }
});

test("opening an image through a view-only link never attempts to save or upload", async ({
  page,
  request,
}) => {
  await apiSignIn(request);
  const drawing = await createDrawing(request, {
    name: `Read-only images ${Date.now()}`,
    elements: [
      {
        id: "readonly-image",
        type: "image",
        fileId: "readonly-file",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scale: [1, 1],
        status: "saved",
      },
    ],
    files: {
      "readonly-file": {
        id: "readonly-file",
        mimeType: "image/png",
        dataURL:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==",
        created: Date.now(),
      },
    },
  });
  try {
    const shared = await request.post(
      `${API_URL}/drawings/${drawing.id}/link-shares`,
      {
        headers: await getCsrfHeaders(request),
        data: { permission: "view" },
      },
    );
    expect(shared.ok()).toBe(true);
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes(`/drawings/${drawing.id}`))
        writes.push(r.url());
    });
    await page.goto(`/shared/${drawing.id}`);
    await expect(
      page.locator("canvas.excalidraw__canvas.interactive"),
    ).toBeVisible();
    // Cover both image upload (800ms) and file polling + autosave (2500ms + 1000ms).
    await page.waitForTimeout(4500);
    await page.keyboard.press("ControlOrMeta+s");
    await page.goto("/");
    expect(writes).toEqual([]);
    expect((await getDrawing(request, drawing.id)).version).toBe(
      drawing.version,
    );
    await expect(
      page.getByText("Failed to save changes", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await deleteDrawing(request, drawing.id);
  }
});
