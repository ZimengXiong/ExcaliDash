import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Collection Sharing - Backend Integration", () => {
  const userAgent = "vitest-collection-sharing";
  let prisma: PrismaClient;
  let app: any;

  let owner: { id: string; email: string };
  let viewer: { id: string; email: string };
  let editor: { id: string; email: string };

  let ownerToken: string;
  let viewerToken: string;
  let editorToken: string;

  let ownerAgent: any;
  let ownerCsrfHeaderName: string;
  let ownerCsrfToken: string;

  let viewerAgent: any;
  let viewerCsrfHeaderName: string;
  let viewerCsrfToken: string;

  let editorAgent: any;
  let editorCsrfHeaderName: string;
  let editorCsrfToken: string;

  const signAccessToken = (user: { id: string; email: string }) => {
    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign(
      { userId: user.id, email: user.email, type: "access" },
      config.jwtSecret,
      signOptions,
    );
  };

  const createUser = async (email: string, name: string) => {
    const passwordHash = await bcrypt.hash("password123", 10);
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });
  };

  const createCollection = async () =>
    prisma.collection.create({
      data: { name: "Shared Collection", userId: owner.id },
      select: { id: true, userId: true, name: true },
    });

  const createDrawingInCollection = async (collectionId: string) =>
    prisma.drawing.create({
      data: {
        name: "Owner Drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: owner.id,
        collectionId,
      },
      select: { id: true, collectionId: true, userId: true },
    });

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: true,
        registrationEnabled: false,
      },
      create: {
        id: "default",
        authEnabled: true,
        registrationEnabled: false,
      },
    });

    owner = await createUser("owner-collections@test.local", "Owner User");
    viewer = await createUser("viewer-collections@test.local", "Viewer User");
    editor = await createUser("editor-collections@test.local", "Editor User");

    ownerToken = signAccessToken(owner);
    viewerToken = signAccessToken(viewer);
    editorToken = signAccessToken(editor);

    ownerAgent = request.agent(app);
    const ownerCsrfRes = await ownerAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    ownerCsrfHeaderName = ownerCsrfRes.body.header;
    ownerCsrfToken = ownerCsrfRes.body.token;

    viewerAgent = request.agent(app);
    const viewerCsrfRes = await viewerAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    viewerCsrfHeaderName = viewerCsrfRes.body.header;
    viewerCsrfToken = viewerCsrfRes.body.token;

    editorAgent = request.agent(app);
    const editorCsrfRes = await editorAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    editorCsrfHeaderName = editorCsrfRes.body.header;
    editorCsrfToken = editorCsrfRes.body.token;
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("adds a viewer share and returns collection metadata for the recipient", async () => {
    const collection = await createCollection();

    const shareResponse = await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });

    expect(shareResponse.status).toBe(200);
    expect(shareResponse.body?.share?.role).toBe("view");
    expect(shareResponse.body?.share?.granteeUserId).toBe(viewer.id);

    const collectionsResponse = await request(app)
      .get("/collections")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(collectionsResponse.status).toBe(200);
    const sharedCollection = (collectionsResponse.body as any[]).find(
      (c) => c.id === collection.id,
    );
    expect(sharedCollection).toBeTruthy();
    expect(sharedCollection?.isOwner).toBe(false);
    expect(sharedCollection?.sharedRole).toBe("view");
  });

  it("allows view access to drawings in shared collection but blocks creating for view-only share", async () => {
    const collection = await createCollection();
    await createDrawingInCollection(collection.id);

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });

    const drawingsListResponse = await request(app)
      .get(`/drawings?collectionId=${collection.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(drawingsListResponse.status).toBe(200);
    expect((drawingsListResponse.body?.drawings ?? []).length).toBe(1);

    const createDrawingResponse = await viewerAgent
      .post("/drawings")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set(viewerCsrfHeaderName, viewerCsrfToken)
      .send({
        name: "Viewer Cannot Create Here",
        elements: [],
        appState: {},
        files: {},
        collectionId: collection.id,
      });

    expect(createDrawingResponse.status).toBe(403);
    expect(createDrawingResponse.body?.error).toContain("No edit access");
  });

  it("allows creating drawings in shared collection for editor role", async () => {
    const collection = await createCollection();

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: editor.email, role: "edit" });

    const createDrawingResponse = await editorAgent
      .post("/drawings")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${editorToken}`)
      .set(editorCsrfHeaderName, editorCsrfToken)
      .send({
        name: "Editor Can Create Here",
        elements: [],
        appState: {},
        files: {},
        collectionId: collection.id,
      });

    expect(createDrawingResponse.status).toBe(200);
    expect(createDrawingResponse.body?.collectionId).toBe(collection.id);
    expect(createDrawingResponse.body?.userId).toBe(editor.id);
  });

  it("uses the stronger collection role when a direct drawing grant is weaker", async () => {
    const collection = await createCollection();
    const drawing = await createDrawingInCollection(collection.id);

    await prisma.collectionShare.create({
      data: {
        collectionId: collection.id,
        granteeUserId: editor.id,
        role: "edit",
        createdByUserId: owner.id,
      },
    });
    await prisma.drawingPermission.create({
      data: {
        drawingId: drawing.id,
        granteeUserId: editor.id,
        permission: "view",
        createdByUserId: owner.id,
      },
    });

    const updateResponse = await editorAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${editorToken}`)
      .set(editorCsrfHeaderName, editorCsrfToken)
      .send({ name: "Edited through collection role" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body?.name).toBe("Edited through collection role");
    expect(updateResponse.body?.accessLevel).toBe("edit");
  });

  it("revokes access after removing collection share", async () => {
    const collection = await createCollection();
    await createDrawingInCollection(collection.id);

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });
    const beforeRevokeListResponse = await request(app)
      .get(`/drawings?collectionId=${collection.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(beforeRevokeListResponse.status).toBe(200);
    expect(beforeRevokeListResponse.headers["x-cache"]).toBe("MISS");

    const deleteShareResponse = await ownerAgent
      .delete(`/collections/${collection.id}/shares/${viewer.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken);

    expect(deleteShareResponse.status).toBe(200);
    expect(deleteShareResponse.body?.success).toBe(true);

    const drawingsListResponse = await request(app)
      .get(`/drawings?collectionId=${collection.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(drawingsListResponse.status).toBe(404);
  });

  it("hides a previously shared collection from the recipient after the owner deletes it", async () => {
    const collection = await createCollection();

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });

    const beforeDeleteCollectionsResponse = await request(app)
      .get("/collections")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(beforeDeleteCollectionsResponse.status).toBe(200);
    expect(
      (beforeDeleteCollectionsResponse.body as any[]).some(
        (c) => c.id === collection.id,
      ),
    ).toBe(true);

    const deleteCollectionResponse = await ownerAgent
      .delete(`/collections/${collection.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken);

    expect(deleteCollectionResponse.status).toBe(200);
    expect(deleteCollectionResponse.body?.success).toBe(true);

    const afterDeleteCollectionsResponse = await request(app)
      .get("/collections")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(afterDeleteCollectionsResponse.status).toBe(200);
    expect(
      (afterDeleteCollectionsResponse.body as any[]).some(
        (c) => c.id === collection.id,
      ),
    ).toBe(false);
  });

  it("prevents a view-only invited user from renaming, editing, or deleting drawings in the shared collection", async () => {
    const collection = await createCollection();
    const drawing = await createDrawingInCollection(collection.id);

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });

    const renameResponse = await viewerAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set(viewerCsrfHeaderName, viewerCsrfToken)
      .send({ name: "Viewer Rename Attempt" });
    expect(renameResponse.status).toBe(404);

    const editResponse = await viewerAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set(viewerCsrfHeaderName, viewerCsrfToken)
      .send({
        elements: [{ id: "v1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
        appState: {},
        files: {},
      });
    expect(editResponse.status).toBe(404);

    const deleteResponse = await viewerAgent
      .delete(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set(viewerCsrfHeaderName, viewerCsrfToken);
    expect(deleteResponse.status).toBe(404);
  });

  it("prevents a view-only invited user from creating a new drawing in a shared collection", async () => {
    const collection = await createCollection();

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });

    const createDrawingResponse = await viewerAgent
      .post("/drawings")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set(viewerCsrfHeaderName, viewerCsrfToken)
      .send({
        name: "Viewer Cannot Create Here",
        elements: [],
        appState: {},
        files: {},
        collectionId: collection.id,
      });

    expect(createDrawingResponse.status).toBe(403);
    expect(createDrawingResponse.body?.error).toContain("No edit access");
  });

  it("prevents a view-only invited user from importing a new drawing into a shared collection", async () => {
    const collection = await createCollection();

    await ownerAgent
      .post(`/collections/${collection.id}/shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ identifier: viewer.email, role: "view" });

    const importDrawingResponse = await viewerAgent
      .post("/drawings")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set(viewerCsrfHeaderName, viewerCsrfToken)
      .set("x-imported-file", "true")
      .send({
        name: "Imported by Viewer",
        elements: [],
        appState: {},
        files: {},
        preview: null,
        collectionId: collection.id,
      });

    expect(importDrawingResponse.status).toBe(403);
    expect(importDrawingResponse.body?.error).toContain("No edit access");
  });
});
