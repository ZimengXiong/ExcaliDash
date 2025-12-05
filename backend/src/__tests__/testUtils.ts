/**
 * Test utilities for backend integration tests
 */
import { PrismaClient } from "../generated/client";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Use a separate test database
const TEST_DB_PATH = path.resolve(__dirname, "../../prisma/test.db");

/**
 * Get a test Prisma client pointing to the test database
 */
export const getTestPrisma = () => {
  const databaseUrl = `file:${TEST_DB_PATH}`;
  process.env.DATABASE_URL = databaseUrl;
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
};

/**
 * Setup the test database by running migrations
 */
export const setupTestDb = () => {
  const databaseUrl = `file:${TEST_DB_PATH}`;
  process.env.DATABASE_URL = databaseUrl;
  
  // Run Prisma migrations to create the test database
  try {
    execSync("npx prisma db push --skip-generate", {
      cwd: path.resolve(__dirname, "../../"),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  } catch (error) {
    console.error("Failed to setup test database:", error);
    throw error;
  }
};

/**
 * Clean up the test database between tests
 */
export const cleanupTestDb = async (prisma: PrismaClient) => {
  // Delete all drawings and collections (except Trash)
  await prisma.drawing.deleteMany({});
  await prisma.collection.deleteMany({
    where: { id: { not: "trash" } },
  });
};

/**
 * Initialize test database with required data
 */
export const initTestDb = async (prisma: PrismaClient) => {
  // Ensure Trash collection exists
  const trash = await prisma.collection.findUnique({
    where: { id: "trash" },
  });
  if (!trash) {
    await prisma.collection.create({
      data: { id: "trash", name: "Trash" },
    });
  }
};

/**
 * Generate a sample base64 PNG image data URL
 * This creates a small but valid PNG for testing
 */
export const generateSampleImageDataUrl = (size: "small" | "medium" | "large" = "small"): string => {
  // Minimal 1x1 red PNG (smallest valid PNG possible)
  const smallPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  
  if (size === "small") {
    return `data:image/png;base64,${smallPng}`;
  }
  
  // For medium/large, repeat the pattern to create larger payloads
  const repetitions = size === "medium" ? 1000 : 10000;
  const paddedBase64 = smallPng.repeat(repetitions);
  
  return `data:image/png;base64,${paddedBase64}`;
};

/**
 * Generate a large image data URL that exceeds the 10000 char limit
 * This is specifically designed to catch the truncation bug from issue #17
 */
export const generateLargeImageDataUrl = (): string => {
  // Create a base64 string that's definitely larger than 10000 characters
  // This simulates a real image that would get truncated by the old code
  const baseImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  // Repeat to create a ~50KB payload
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
    
    // Check dataURL specifically - this is where truncation would occur
    if (origFile.dataURL !== recvFile.dataURL) {
      differences.push(
        `DataURL mismatch for ${key}: ` +
        `original length=${origFile.dataURL?.length ?? 0}, ` +
        `received length=${recvFile.dataURL?.length ?? 0}`
      );
      
      // Check if it was truncated
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
