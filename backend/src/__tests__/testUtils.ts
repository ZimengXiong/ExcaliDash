/**
 * Test utilities for backend integration tests
 *
 * With PostgreSQL, all test files share one database. Each file runs in
 * its own sequential fork (fileParallelism: false + singleFork: false).
 * We use TRUNCATE to reset data between files and a Proxy to prevent
 * afterAll $disconnect() from tearing down the shared PrismaClient.
 */
import { PrismaClient } from "../generated/client";
import { prisma as appPrisma } from "../db/prisma";
import { authModeService } from "../middleware/auth";

/**
 * Get a Prisma client for test data setup.
 * Returns a proxy around the app's shared PrismaClient so that:
 * - Tests and app share the same connection pool (no dual-client issues)
 * - afterAll $disconnect() calls are safely ignored
 */
export const getTestPrisma = (): PrismaClient => {
  return new Proxy(appPrisma, {
    get(target, prop, receiver) {
      if (prop === "$disconnect") {
        return async () => {};
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as PrismaClient;
};

/**
 * Reset the test database by truncating all tables and clearing app caches.
 * Uses the app's own PrismaClient to avoid connection pool issues.
 */
export const setupTestDb = async () => {
  await appPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "AuthIdentity", "RefreshToken", "PasswordResetToken",
      "DrawingLinkShare", "DrawingPermission", "Drawing",
      "Collection", "Library", "SystemConfig", "User"
    CASCADE
  `);
  authModeService.clearAuthEnabledCache();
};

/**
 * Clean up the test database between tests
 */
export const cleanupTestDb = async (prisma: PrismaClient) => {
  await prisma.drawing.deleteMany({});
  await prisma.collection.deleteMany({});
};

/**
 * Create a test user for testing
 */
export const createTestUser = async (prisma: PrismaClient, email: string = "test@example.com") => {
  const bcrypt = require("bcrypt");
  const passwordHash = await bcrypt.hash("testpassword", 10);

  return await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: "Test User",
    },
  });
};

/**
 * Initialize test database with required data
 */
export const initTestDb = async (prisma: PrismaClient) => {
  const testUser = await createTestUser(prisma);
  const trashCollectionId = `trash:${testUser.id}`;

  const trash = await prisma.collection.findFirst({
    where: { id: trashCollectionId, userId: testUser.id },
  });
  if (!trash) {
    await prisma.collection.create({
      data: { id: trashCollectionId, name: "Trash", userId: testUser.id },
    });
  }

  return testUser;
};

/**
 * Generate a sample base64 PNG image data URL
 */
export const generateSampleImageDataUrl = (size: "small" | "medium" | "large" = "small"): string => {
  const smallPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  if (size === "small") {
    return `data:image/png;base64,${smallPng}`;
  }

  const repetitions = size === "medium" ? 1000 : 10000;
  const paddedBase64 = smallPng.repeat(repetitions);

  return `data:image/png;base64,${paddedBase64}`;
};

/**
 * Generate a large image data URL that exceeds the 10000 char limit
 */
export const generateLargeImageDataUrl = (): string => {
  const baseImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const largeBase64 = baseImage.repeat(500);
  return `data:image/png;base64,${largeBase64}`;
};

/**
 * Create a sample Excalidraw files object with embedded images
 */
export const createSampleFilesObject = (imageCount: number = 1, size: "small" | "large" = "small") => {
  const files: Record<string, any> = {};

  for (let i = 0; i < imageCount; i++) {
    const fileId = `file-${i}-${Date.now()}`;
    files[fileId] = {
      id: fileId,
      mimeType: "image/png",
      dataURL: size === "large" ? generateLargeImageDataUrl() : generateSampleImageDataUrl("small"),
      created: Date.now(),
      lastRetrieved: Date.now(),
    };
  }

  return files;
};

/**
 * Create a minimal valid Excalidraw drawing payload
 */
export const createTestDrawingPayload = (options: {
  name?: string;
  files?: Record<string, any> | null;
  elements?: any[];
  appState?: any;
} = {}) => {
  return {
    name: options.name ?? "Test Drawing",
    elements: options.elements ?? [
      {
        id: "element-1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 12345,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
      },
    ],
    appState: options.appState ?? {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
    },
    files: options.files ?? null,
    preview: null,
    collectionId: null,
  };
};

/**
 * Compare two files objects to check if image data was preserved
 */
export const compareFilesObjects = (original: Record<string, any>, received: Record<string, any>): {
  isEqual: boolean;
  differences: string[];
} => {
  const differences: string[] = [];

  const originalKeys = Object.keys(original);
  const receivedKeys = Object.keys(received);

  if (originalKeys.length !== receivedKeys.length) {
    differences.push(`Key count mismatch: original=${originalKeys.length}, received=${receivedKeys.length}`);
  }

  for (const key of originalKeys) {
    if (!(key in received)) {
      differences.push(`Missing key: ${key}`);
      continue;
    }

    const origFile = original[key];
    const recvFile = received[key];

    if (origFile.dataURL !== recvFile.dataURL) {
      differences.push(
        `DataURL mismatch for ${key}: ` +
        `original length=${origFile.dataURL?.length ?? 0}, ` +
        `received length=${recvFile.dataURL?.length ?? 0}`
      );

      if (recvFile.dataURL && origFile.dataURL?.startsWith(recvFile.dataURL.substring(0, 100))) {
        differences.push(`TRUNCATION DETECTED: dataURL was cut short`);
      }
    }
  }

  return {
    isEqual: differences.length === 0,
    differences,
  };
};
