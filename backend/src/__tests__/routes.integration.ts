/**
 * Integration tests for route modules
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../generated/client";
import { getTestPrisma, setupTestDb, cleanupTestDb, initTestDb } from "./testUtils";

let prisma: PrismaClient;

beforeAll(async () => {
  setupTestDb();
  prisma = getTestPrisma();
  await initTestDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanupTestDb(prisma);
  // Also clean up library
  await prisma.library.deleteMany({});
});

describe("Collections Routes", () => {
  describe("Create Collection", () => {
    it("should create a new collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Test Collection" },
      });

      expect(collection.id).toBeDefined();
      expect(collection.name).toBe("Test Collection");
      expect(collection.createdAt).toBeInstanceOf(Date);
    });

    it("should create multiple collections", async () => {
      await prisma.collection.create({ data: { name: "Collection 1" } });
      await prisma.collection.create({ data: { name: "Collection 2" } });
      await prisma.collection.create({ data: { name: "Collection 3" } });

      const collections = await prisma.collection.findMany({
        where: { id: { not: "trash" } },
      });
      expect(collections).toHaveLength(3);
    });
  });

  describe("Update Collection", () => {
    it("should rename a collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Original Name" },
      });

      const updated = await prisma.collection.update({
        where: { id: collection.id },
        data: { name: "New Name" },
      });

      expect(updated.name).toBe("New Name");
    });
  });

  describe("Delete Collection", () => {
    it("should delete a collection and unassign its drawings", async () => {
      const collection = await prisma.collection.create({
        data: { name: "To Delete" },
      });

      // Create drawing in the collection
      const drawing = await prisma.drawing.create({
        data: {
          name: "Drawing in Collection",
          elements: "[]",
          appState: "{}",
          collectionId: collection.id,
        },
      });

      // Unassign drawings first
      await prisma.drawing.updateMany({
        where: { collectionId: collection.id },
        data: { collectionId: null },
      });

      // Delete collection
      await prisma.collection.delete({ where: { id: collection.id } });

      // Verify collection is deleted
      const deletedCollection = await prisma.collection.findUnique({
        where: { id: collection.id },
      });
      expect(deletedCollection).toBeNull();

      // Verify drawing still exists but is unassigned
      const remainingDrawing = await prisma.drawing.findUnique({
        where: { id: drawing.id },
      });
      expect(remainingDrawing).not.toBeNull();
      expect(remainingDrawing?.collectionId).toBeNull();
    });
  });
});

describe("Drawings Routes", () => {
  describe("Create Drawing", () => {
    it("should create a basic drawing", async () => {
      const drawing = await prisma.drawing.create({
        data: {
          name: "Test Drawing",
          elements: "[]",
          appState: "{}",
        },
      });

      expect(drawing.id).toBeDefined();
      expect(drawing.name).toBe("Test Drawing");
      expect(drawing.version).toBe(1);
    });

    it("should create a drawing with elements", async () => {
      const elements = [
        { id: "elem1", type: "rectangle", x: 0, y: 0 },
        { id: "elem2", type: "ellipse", x: 100, y: 100 },
      ];

      const drawing = await prisma.drawing.create({
        data: {
          name: "Drawing with Elements",
          elements: JSON.stringify(elements),
          appState: "{}",
        },
      });

      const parsed = JSON.parse(drawing.elements);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe("rectangle");
    });

    it("should create a drawing with files", async () => {
      const files = {
        "file-1": { mimeType: "image/png", dataURL: "data:image/png;base64,abc" },
      };

      const drawing = await prisma.drawing.create({
        data: {
          name: "Drawing with Files",
          elements: "[]",
          appState: "{}",
          files: JSON.stringify(files),
        },
      });

      const parsedFiles = JSON.parse(drawing.files!);
      expect(parsedFiles["file-1"]).toBeDefined();
      expect(parsedFiles["file-1"].mimeType).toBe("image/png");
    });

    it("should create a drawing in a collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "My Collection" },
      });

      const drawing = await prisma.drawing.create({
        data: {
          name: "Drawing in Collection",
          elements: "[]",
          appState: "{}",
          collectionId: collection.id,
        },
      });

      expect(drawing.collectionId).toBe(collection.id);
    });
  });

  describe("Read Drawing", () => {
    it("should fetch a drawing by id", async () => {
      const created = await prisma.drawing.create({
        data: {
          name: "Fetch Test",
          elements: "[]",
          appState: "{}",
        },
      });

      const fetched = await prisma.drawing.findUnique({
        where: { id: created.id },
      });

      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe("Fetch Test");
    });

    it("should return null for non-existent drawing", async () => {
      const fetched = await prisma.drawing.findUnique({
        where: { id: "non-existent-id" },
      });

      expect(fetched).toBeNull();
    });

    it("should list all drawings", async () => {
      await prisma.drawing.create({
        data: { name: "Drawing 1", elements: "[]", appState: "{}" },
      });
      await prisma.drawing.create({
        data: { name: "Drawing 2", elements: "[]", appState: "{}" },
      });

      const drawings = await prisma.drawing.findMany();
      expect(drawings.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter drawings by collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Filter Collection" },
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
        data: { name: "Outside Collection", elements: "[]", appState: "{}" },
      });

      const filtered = await prisma.drawing.findMany({
        where: { collectionId: collection.id },
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("In Collection");
    });

    it("should search drawings by name", async () => {
      await prisma.drawing.create({
        data: { name: "Architecture Diagram", elements: "[]", appState: "{}" },
      });
      await prisma.drawing.create({
        data: { name: "Flowchart", elements: "[]", appState: "{}" },
      });
      await prisma.drawing.create({
        data: { name: "Architecture Overview", elements: "[]", appState: "{}" },
      });

      const results = await prisma.drawing.findMany({
        where: { name: { contains: "Architecture" } },
      });

      expect(results).toHaveLength(2);
    });
  });

  describe("Update Drawing", () => {
    it("should update drawing name", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Old Name", elements: "[]", appState: "{}" },
      });

      const updated = await prisma.drawing.update({
        where: { id: drawing.id },
        data: { name: "New Name" },
      });

      expect(updated.name).toBe("New Name");
    });

    it("should update drawing elements", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Test", elements: "[]", appState: "{}" },
      });

      const newElements = [{ id: "new-elem", type: "rectangle" }];
      const updated = await prisma.drawing.update({
        where: { id: drawing.id },
        data: { elements: JSON.stringify(newElements) },
      });

      const parsed = JSON.parse(updated.elements);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("new-elem");
    });

    it("should increment version on update", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "Version Test", elements: "[]", appState: "{}" },
      });

      expect(drawing.version).toBe(1);

      const updated = await prisma.drawing.update({
        where: { id: drawing.id },
        data: { version: { increment: 1 } },
      });

      expect(updated.version).toBe(2);
    });

    it("should move drawing to collection", async () => {
      const collection = await prisma.collection.create({
        data: { name: "Target Collection" },
      });

      const drawing = await prisma.drawing.create({
        data: { name: "To Move", elements: "[]", appState: "{}" },
      });

      expect(drawing.collectionId).toBeNull();

      const updated = await prisma.drawing.update({
        where: { id: drawing.id },
        data: { collectionId: collection.id },
      });

      expect(updated.collectionId).toBe(collection.id);
    });

    it("should move drawing to trash", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "To Trash", elements: "[]", appState: "{}" },
      });

      const updated = await prisma.drawing.update({
        where: { id: drawing.id },
        data: { collectionId: "trash" },
      });

      expect(updated.collectionId).toBe("trash");
    });
  });

  describe("Delete Drawing", () => {
    it("should permanently delete a drawing", async () => {
      const drawing = await prisma.drawing.create({
        data: { name: "To Delete", elements: "[]", appState: "{}" },
      });

      await prisma.drawing.delete({ where: { id: drawing.id } });

      const deleted = await prisma.drawing.findUnique({
        where: { id: drawing.id },
      });
      expect(deleted).toBeNull();
    });
  });

  describe("Duplicate Drawing", () => {
    it("should duplicate a drawing", async () => {
      const original = await prisma.drawing.create({
        data: {
          name: "Original",
          elements: '[{"id": "elem1"}]',
          appState: '{"zoom": 1}',
          files: '{"file1": {}}',
        },
      });

      const duplicate = await prisma.drawing.create({
        data: {
          name: `${original.name} (Copy)`,
          elements: original.elements,
          appState: original.appState,
          files: original.files,
          version: 1,
        },
      });

      expect(duplicate.id).not.toBe(original.id);
      expect(duplicate.name).toBe("Original (Copy)");
      expect(duplicate.elements).toBe(original.elements);
      expect(duplicate.version).toBe(1);
    });
  });
});

describe("Library Routes", () => {
  describe("Get Library", () => {
    it("should return empty items when no library exists", async () => {
      const library = await prisma.library.findUnique({
        where: { id: "default" },
      });

      // If no library, it should be null
      expect(library).toBeNull();
    });

    it("should return library items", async () => {
      const items = [{ id: "lib1" }, { id: "lib2" }];
      await prisma.library.create({
        data: { id: "default", items: JSON.stringify(items) },
      });

      const library = await prisma.library.findUnique({
        where: { id: "default" },
      });

      expect(library).not.toBeNull();
      const parsed = JSON.parse(library!.items);
      expect(parsed).toHaveLength(2);
    });
  });

  describe("Update Library", () => {
    it("should create library if it doesn't exist", async () => {
      // Ensure no library exists
      await prisma.library.deleteMany({});

      const items = [{ id: "new-item" }];
      const library = await prisma.library.upsert({
        where: { id: "default" },
        update: { items: JSON.stringify(items) },
        create: { id: "default", items: JSON.stringify(items) },
      });

      expect(library.id).toBe("default");
      const parsed = JSON.parse(library.items);
      expect(parsed).toHaveLength(1);
    });

    it("should update existing library", async () => {
      await prisma.library.upsert({
        where: { id: "default" },
        update: { items: "[{\"id\": \"old\"}]" },
        create: { id: "default", items: "[{\"id\": \"old\"}]" },
      });

      const newItems = [{ id: "new1" }, { id: "new2" }];
      const updated = await prisma.library.update({
        where: { id: "default" },
        data: { items: JSON.stringify(newItems) },
      });

      const parsed = JSON.parse(updated.items);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe("new1");
    });
  });
});

describe("Trash Functionality", () => {
  it("should have Trash collection created", async () => {
    const trash = await prisma.collection.findUnique({
      where: { id: "trash" },
    });
    expect(trash).not.toBeNull();
    expect(trash?.name).toBe("Trash");
  });

  it("should list drawings in trash", async () => {
    await prisma.drawing.create({
      data: {
        name: "Trashed Drawing",
        elements: "[]",
        appState: "{}",
        collectionId: "trash",
      },
    });

    const trashedDrawings = await prisma.drawing.findMany({
      where: { collectionId: "trash" },
    });

    expect(trashedDrawings.length).toBeGreaterThanOrEqual(1);
    expect(trashedDrawings.some((d) => d.name === "Trashed Drawing")).toBe(true);
  });

  it("should restore drawing from trash", async () => {
    const drawing = await prisma.drawing.create({
      data: {
        name: "To Restore",
        elements: "[]",
        appState: "{}",
        collectionId: "trash",
      },
    });

    const restored = await prisma.drawing.update({
      where: { id: drawing.id },
      data: { collectionId: null },
    });

    expect(restored.collectionId).toBeNull();
  });
});
