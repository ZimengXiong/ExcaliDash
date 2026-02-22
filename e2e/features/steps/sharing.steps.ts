import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  createDrawing,
  createUser,
  getDrawingSharing,
  upsertDrawingPermission,
  revokeDrawingPermission,
  createLinkShare,
  revokeLinkShare,
  resolveShareUsers,
  listSharedDrawings,
  getDrawing,
  getCsrfHeaders,
  API_URL,
} from "./api-helpers";

const SECOND_USER_EMAIL = `bdd-share-user-${Date.now()}@example.com`;
const SECOND_USER_PASSWORD = "ShareTest!123";
const SECOND_USER_NAME = "BDD Share User";

Given("a second user exists", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");

  if (this.scenarioData.secondUserId) return;

  const user = await createUser(this.request, {
    email: SECOND_USER_EMAIL,
    password: SECOND_USER_PASSWORD,
    name: SECOND_USER_NAME,
  });

  this.scenarioData.secondUserId = user.id;
  this.scenarioData.secondUserEmail = SECOND_USER_EMAIL;
  this.scenarioData.secondUserName = SECOND_USER_NAME;
  this.createdUserIds.push(user.id);
});

When("I grant the second user view access to the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const perm = await upsertDrawingPermission(this.request, drawingId, {
    granteeUserId,
    permission: "view",
  });
  this.scenarioData.permissionId = perm.id;
});

When("I grant the second user edit access to the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const perm = await upsertDrawingPermission(this.request, drawingId, {
    granteeUserId,
    permission: "edit",
  });
  this.scenarioData.permissionId = perm.id;
});

Then("the drawing sharing should list the second user with view access", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const sharing = await getDrawingSharing(this.request, drawingId);
  const userPerm = sharing.permissions.find((p) => p.granteeUserId === granteeUserId);
  expect(userPerm).toBeDefined();
  expect(userPerm!.permission).toBe("view");
});

Then("the drawing sharing should list the second user with edit access", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const sharing = await getDrawingSharing(this.request, drawingId);
  const userPerm = sharing.permissions.find((p) => p.granteeUserId === granteeUserId);
  expect(userPerm).toBeDefined();
  expect(userPerm!.permission).toBe("edit");
});

Given("the second user has view access to the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const perm = await upsertDrawingPermission(this.request, drawingId, {
    granteeUserId,
    permission: "view",
  });
  this.scenarioData.permissionId = perm.id;
});

When("I change the second user permission to edit", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const perm = await upsertDrawingPermission(this.request, drawingId, {
    granteeUserId,
    permission: "edit",
  });
  this.scenarioData.permissionId = perm.id;
});

When("I revoke the second user access to the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const permissionId = this.scenarioData.permissionId as string;

  await revokeDrawingPermission(this.request, drawingId, permissionId);
});

Then("the drawing sharing should not list the second user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const granteeUserId = this.scenarioData.secondUserId as string;

  const sharing = await getDrawingSharing(this.request, drawingId);
  const userPerm = sharing.permissions.find((p) => p.granteeUserId === granteeUserId);
  expect(userPerm).toBeUndefined();
});

When("I create a view link share for the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  const linkShare = await createLinkShare(this.request, drawingId, { permission: "view" });
  this.scenarioData.linkShareId = linkShare.id;
});

When("I create an edit link share for the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  const linkShare = await createLinkShare(this.request, drawingId, { permission: "edit" });
  this.scenarioData.linkShareId = linkShare.id;
});

Then("the drawing should have an active view link share", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  const sharing = await getDrawingSharing(this.request, drawingId);
  const activeLinks = sharing.linkShares.filter((ls) => !ls.revokedAt);
  expect(activeLinks.length).toBeGreaterThanOrEqual(1);
  expect(activeLinks.some((ls) => ls.permission === "view")).toBe(true);
});

Then("the drawing should have an active edit link share", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  const sharing = await getDrawingSharing(this.request, drawingId);
  const activeLinks = sharing.linkShares.filter((ls) => !ls.revokedAt);
  expect(activeLinks.length).toBeGreaterThanOrEqual(1);
  expect(activeLinks.some((ls) => ls.permission === "edit")).toBe(true);
});

Given("a view link share exists for the drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  const linkShare = await createLinkShare(this.request, drawingId, { permission: "view" });
  this.scenarioData.linkShareId = linkShare.id;
});

When("I revoke the link share", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const linkShareId = this.scenarioData.linkShareId as string;

  await revokeLinkShare(this.request, drawingId, linkShareId);
});

Then("the drawing should have no active link shares", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  const sharing = await getDrawingSharing(this.request, drawingId);
  const activeLinks = sharing.linkShares.filter((ls) => !ls.revokedAt);
  expect(activeLinks.length).toBe(0);
});

When("an unauthenticated user accesses the shared drawing", async function (this: ExcaliDashWorld) {
  const drawingId = this.scenarioData.drawingId as string;
  const apiUrl = process.env.API_URL || this.apiUrl || API_URL;

  // Create an unauthenticated request context (no auth cookies)
  const anonRequest = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const response = await anonRequest.get(`${apiUrl}/drawings/${drawingId}`);
    this.scenarioData.sharedDrawingResponse = {
      ok: response.ok(),
      status: response.status(),
    };
    if (response.ok()) {
      this.scenarioData.sharedDrawingData = await response.json();
    }
  } finally {
    await anonRequest.dispose();
  }
});

Then("the shared drawing should be accessible", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.sharedDrawingResponse as { ok: boolean; status: number };
  expect(response.ok).toBe(true);
});

When("I list drawings shared with the second user", async function (this: ExcaliDashWorld) {
  const apiUrl = process.env.API_URL || this.apiUrl || API_URL;
  const secondUserEmail = this.scenarioData.secondUserEmail as string;

  // Log in as the second user to check their shared drawings
  const secondUserRequest = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const csrfResponse = await secondUserRequest.get(`${apiUrl}/csrf-token`, {
      headers: { origin: process.env.BASE_URL || "http://127.0.0.1:5173" },
    });
    const csrfData = (await csrfResponse.json()) as { token: string; header?: string };
    const csrfHeader = csrfData.header || "x-csrf-token";

    await secondUserRequest.post(`${apiUrl}/auth/login`, {
      headers: {
        "Content-Type": "application/json",
        [csrfHeader]: csrfData.token,
        origin: process.env.BASE_URL || "http://127.0.0.1:5173",
      },
      data: {
        email: secondUserEmail,
        password: SECOND_USER_PASSWORD,
      },
    });

    const shared = await listSharedDrawings(secondUserRequest);
    this.scenarioData.sharedDrawingsList = shared;
  } finally {
    await secondUserRequest.dispose();
  }
});

Then("the shared drawings list should include the drawing", async function (this: ExcaliDashWorld) {
  const drawingId = this.scenarioData.drawingId as string;
  const sharedList = this.scenarioData.sharedDrawingsList as Array<{ id: string }>;
  expect(sharedList.some((d) => d.id === drawingId)).toBe(true);
});

When("I search for users to share the drawing with", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const secondUserName = this.scenarioData.secondUserName as string;

  // Search by name (minimum 3 chars required)
  const query = secondUserName.substring(0, 5);
  const results = await resolveShareUsers(this.request, drawingId, query);
  this.scenarioData.resolveResults = results;
});

Then("the resolve results should include the second user", async function (this: ExcaliDashWorld) {
  const secondUserId = this.scenarioData.secondUserId as string;
  const results = this.scenarioData.resolveResults as Array<{ id: string }>;
  expect(results.some((u) => u.id === secondUserId)).toBe(true);
});
