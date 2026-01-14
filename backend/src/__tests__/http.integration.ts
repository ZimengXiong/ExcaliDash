/**
 * HTTP-level integration tests for routes
 * Tests the actual Express route handlers
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { PrismaClient } from "../generated/client";
import {
  createDrawingsRouter,
  createCollectionsRouter,
  createLibraryRouter,
} from "../routes";
import { invalidateDrawingsCache } from "../utils/cache";
import { getTestPrisma, setupTestDb, cleanupTestDb, initTestDb } from "./testUtils";

let app: Express;
let prisma: PrismaClient;

beforeAll(async () => {
  setupTestDb();
  prisma = getTestPrisma();
  await initTestDb(prisma);

  // Create Express app with routes
  app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/drawings", createDrawingsRouter(prisma));
  app.use("/collections", createCollectionsRouter(prisma));
  app.use("/library", createLibraryRouter(prisma));
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanupTestDb(prisma);
  await prisma.library.deleteMany({});
  invalidateDrawingsCache();
});

describe("Drawings HTTP Routes", () => {
  describe("GET /drawings", () => {
    it("should return empty array when no drawings", async () => {
      const res = await request(app).get("/drawings");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should return drawings list", async () => {
      await prisma.drawing.create({
        data: { name: "Test Drawing", elements: "[]", appState: "{}" },
      });

      const res = await request(app).get("/drawings");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Test Drawing");
    });

    it("should filter by search term", async () => {
      await prisma.drawing.create({
        data: { name: "Architecture", elements: "[]", appState: "{}" },
      });
      await prisma.drawing.create({
        data: { name: "Flowchart", elements: "[]", appState: "{}" },
      });

      const res = await request(app).get("/drawings?search=arch");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Architecture");
    });

    it("should filter by collectionId", async () => {
      const collection = await prisma.collection.create({
        data: { name: "My Collection" },
      });
      await prisma.drawing.create({
        data: {
          name: "In Collection",
          elements: "[]",
          appState: "{}",
          collectionId: collection.id,
        },
      });
      await prisma.drawing.create({
        data: { name: "Outside", elements: "[]", appState: "{}" },
      });

      const res = await request(app).get(`/drawings?collectionId=${collection.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("In Collection");
    });

    it("should filter by null collectionId for unorganized", async () => {
      const collection = await prisma.collection.create({
        data: { name: "My Collection" },
      });
      await prisma.drawing.create({
        data: {
          name: "In Collection",
          elements: "[]",
          appState: "{}",
          collectionId: collection.id,
        },
      });
      await prisma.drawing.create({
        data: { name: "Unorganized", elements: "[]", appState: "{}" },
      });

      const res = await request(app).get("/drawings?collectionId=null");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Unorganized");
    });

    it("should return full data when includeData=true", async () => {
      const elements = [{ id: "elem1", type: "rect" }];
      await prisma.drawing.create({
        data: {
          name: "Full Data Test",
          elements: JSON.stringify(elements),
          appState: '{"zoom": {"value": 1}}',
        },
      });

      const res = await request(app).get("/drawings?includeData=true");
      expect(res.status).toBe(200);
      expect(res.body[0].elements).toEqual(elements);
    });

    it("should use cache on repeated requests", async () => {
      await prisma.drawing.create({
        data: { name: "Cached", elements: "[]", appState: "{}" },
      });

      const res1 = await request(app).get("/drawings");
      const res2 = await request(app).get("/drawings");

      expect(res1.headers["x-cache"]).toBe("MISS");
      expect(res2.headers["x-cache"]).toBe("HIT");
    });
  });

  describe("GET /drawings/:id", () => {
    it("should return a drawing by id", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Specific Drawing", elements: "[]", appState: "{}" },
      });

      const res = await request(app).get(`/drawings/${drawing.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(drawing.id);
      expect(res.body.name).toBe("Specific Drawing");
    });

    it("should return 404 for non-existent drawing", async () => {
      const res = await request(app).get("/drawings/non-existent-id");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Drawing not found");
    });

    it("should parse JSON fields in response", async () => {
      const elements = [{ id: "elem1" }];
      const appState = { viewBackgroundColor: "#ffffff" };
      const drawing = await prisma.drawing.create({
        data: {
          name: "JSON Test",
          elements: JSON.stringify(elements),
          appState: JSON.stringify(appState),
        },
      });

      const res = await request(app).get(`/drawings/${drawing.id}`);
      expect(res.body.elements).toEqual(elements);
      expect(res.body.appState).toEqual(appState);
    });
  });

  describe("POST /drawings", () => {
    it("should create a basic drawing", async () => {
      const res = await request(app)
        .post("/drawings")
        .send({ name: "New Drawing", elements: [], appState: {} });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe("New Drawing");
    });

    it("should create with default name if not provided", async () => {
      const res = await request(app)
        .post("/drawings")
        .send({ elements: [], appState: {} });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Untitled Drawing");
    });

    it("should create in a collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Target" },
      });

      const res = await request(app)
        .post("/drawings")
        .send({
          name: "In Collection",
          elements: [],
          appState: {},
          collectionId: collection.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.collectionId).toBe(collection.id);
    });

    it("should reject invalid elements", async () => {
      const res = await request(app)
        .post("/drawings")
        .send({ name: "Invalid", elements: "not an array", appState: {} });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /drawings/:id", () => {
    it("should update drawing name", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Original", elements: "[]", appState: "{}" },
      });

      const res = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Name");
    });

    it("should update drawing elements", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Test", elements: "[]", appState: "{}" },
      });

      const newElements = [{ id: "new-elem", type: "rectangle" }];
      const res = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({ elements: newElements });

      expect(res.status).toBe(200);
      expect(res.body.elements).toEqual(newElements);
    });

    it("should increment version on update", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Version Test", elements: "[]", appState: "{}" },
      });

      const res = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({ name: "Updated" });

      expect(res.body.version).toBe(2);
    });

    it("should move drawing to collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Target" },
      });
      const drawing = await prisma.drawing.create({
        data: { name: "To Move", elements: "[]", appState: "{}" },
      });

      const res = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({ collectionId: collection.id });

      expect(res.status).toBe(200);
      expect(res.body.collectionId).toBe(collection.id);
    });

    it("should reject invalid update payload", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Test", elements: "[]", appState: "{}" },
      });

      const res = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({ elements: "invalid" });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /drawings/:id", () => {
    it("should delete a drawing", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "To Delete", elements: "[]", appState: "{}" },
      });

      const res = await request(app).delete(`/drawings/${drawing.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await prisma.drawing.findUnique({
        where: { id: drawing.id },
      });
      expect(deleted).toBeNull();
    });
  });

  describe("POST /drawings/:id/duplicate", () => {
    it("should duplicate a drawing", async () => {
      const original = await prisma.drawing.create({
        data: {
          name: "Original",
          elements: '[{"id": "elem1"}]',
          appState: '{"zoom": {"value": 1}}',
        },
      });

      const res = await request(app).post(`/drawings/${original.id}/duplicate`);
      expect(res.status).toBe(200);
      expect(res.body.id).not.toBe(original.id);
      expect(res.body.name).toBe("Original (Copy)");
      expect(res.body.elements).toEqual([{ id: "elem1" }]);
    });

    it("should return 404 for non-existent drawing", async () => {
      const res = await request(app).post("/drawings/non-existent/duplicate");
      expect(res.status).toBe(404);
    });
  });
});

describe("Collections HTTP Routes", () => {
  describe("GET /collections", () => {
    it("should return collections list", async () => {
      await prisma.collection.create({ data: { name: "Collection 1" } });
      await prisma.collection.create({ data: { name: "Collection 2" } });

      const res = await request(app).get("/collections");
      expect(res.status).toBe(200);
      // Note: Trash collection is always present
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("POST /collections", () => {
    it("should create a collection", async () => {
      const res = await request(app)
        .post("/collections")
        .send({ name: "New Collection" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Collection");
      expect(res.body.id).toBeDefined();
    });
  });

  describe("PUT /collections/:id", () => {
    it("should rename a collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Original" },
      });

      const res = await request(app)
        .put(`/collections/${collection.id}`)
        .send({ name: "Renamed" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Renamed");
    });
  });

  describe("DELETE /collections/:id", () => {
    it("should delete collection and unassign drawings", async () => {
      const collection = await prisma.collection.create({
        data: { name: "To Delete" },
      });
      await prisma.drawing.create({
        data: {
          name: "In Collection",
          elements: "[]",
          appState: "{}",
          collectionId: collection.id,
        },
      });

      const res = await request(app).delete(`/collections/${collection.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify collection is deleted
      const deletedCollection = await prisma.collection.findUnique({
        where: { id: collection.id },
      });
      expect(deletedCollection).toBeNull();

      // Verify drawing is unassigned
      const drawings = await prisma.drawing.findMany({
        where: { name: "In Collection" },
      });
      expect(drawings[0].collectionId).toBeNull();
    });
  });
});

describe("Library HTTP Routes", () => {
  describe("GET /library", () => {
    it("should return empty items when no library", async () => {
      const res = await request(app).get("/library");
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it("should return library items", async () => {
      const items = [{ id: "lib1" }, { id: "lib2" }];
      await prisma.library.create({
        data: { id: "default", items: JSON.stringify(items) },
      });

      const res = await request(app).get("/library");
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(items);
    });
  });

  describe("PUT /library", () => {
    it("should create library if not exists", async () => {
      const items = [{ id: "new-item" }];
      const res = await request(app).put("/library").send({ items });

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(items);
    });

    it("should update existing library", async () => {
      await prisma.library.create({
        data: { id: "default", items: "[{\"id\": \"old\"}]" },
      });

      const newItems = [{ id: "new1" }, { id: "new2" }];
      const res = await request(app).put("/library").send({ items: newItems });

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual(newItems);
    });

    it("should reject non-array items", async () => {
      const res = await request(app).put("/library").send({ items: "not array" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Items must be an array");
    });
  });
});
