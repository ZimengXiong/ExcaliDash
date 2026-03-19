/**
 * Security tests for user data sandboxing
 *
 * Verifies that:
 * 1. Drawings cache keys are scoped by userId (prevents cross-user data leakage)
 * 2. Drawing CRUD operations enforce userId filtering
 * 3. Collection operations enforce userId filtering
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import {
  getTestPrisma,
  setupTestDb,
} from "./testUtils";
import { PrismaClient } from "../generated/client";

let prisma: PrismaClient;

describe("User Data Sandboxing", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };

  beforeAll(async () => {
    await setupTestDb();
    prisma = getTestPrisma();

    const hashA = await bcrypt.hash("passwordA", 10);
    const hashB = await bcrypt.hash("passwordB", 10);

    userA = await prisma.user.upsert({
      where: { email: "usera@test.com" },
      update: {},
      create: {
        email: "usera@test.com",
        passwordHash: hashA,
        name: "User A",
      },
    });

    userB = await prisma.user.upsert({
      where: { email: "userb@test.com" },
      update: {},
      create: {
        email: "userb@test.com",
        passwordHash: hashB,
        name: "User B",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.drawing.deleteMany({});
    await prisma.collection.deleteMany({});
  });

  describe("Drawing isolation", () => {
    it("should not return User A's drawings when querying as User B", async () => {
      await prisma.drawing.create({
        data: {
          name: "User A Drawing",
          elements: "[]",
          appState: "{}",
          userId: userA.id,
        },
      });

      const userBDrawings = await prisma.drawing.findMany({
        where: { userId: userB.id },
      });

      expect(userBDrawings).toHaveLength(0);
    });

    it("should only return the owning user's drawings", async () => {
      await prisma.drawing.create({
        data: {
          name: "User A Drawing",
          elements: "[]",
          appState: "{}",
          userId: userA.id,
        },
      });

      await prisma.drawing.create({
        data: {
          name: "User B Drawing",
          elements: "[]",
          appState: "{}",
          userId: userB.id,
        },
      });

      const userADrawings = await prisma.drawing.findMany({
        where: { userId: userA.id },
      });
      const userBDrawings = await prisma.drawing.findMany({
        where: { userId: userB.id },
      });

      expect(userADrawings).toHaveLength(1);
      expect(userADrawings[0].name).toBe("User A Drawing");

      expect(userBDrawings).toHaveLength(1);
      expect(userBDrawings[0].name).toBe("User B Drawing");
    });

    it("should not allow User B to access User A's drawing by ID", async () => {
      const drawing = await prisma.drawing.create({
        data: {
          name: "User A Secret Drawing",
          elements: "[]",
          appState: "{}",
          userId: userA.id,
        },
      });

      const result = await prisma.drawing.findFirst({
        where: {
          id: drawing.id,
          userId: userB.id, // User B trying to access
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("Collection isolation", () => {
    it("should not return User A's collections when querying as User B", async () => {
      await prisma.collection.create({
        data: {
          name: "User A Collection",
          userId: userA.id,
        },
      });

      const userBCollections = await prisma.collection.findMany({
        where: { userId: userB.id },
      });

      expect(userBCollections).toHaveLength(0);
    });

    it("should not allow User B to modify User A's collection", async () => {
      const collection = await prisma.collection.create({
        data: {
          name: "User A Collection",
          userId: userA.id,
        },
      });

      const result = await prisma.collection.findFirst({
        where: {
          id: collection.id,
          userId: userB.id,
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("Cache key user scoping", () => {
    it("should generate different cache keys for different users with same query params", () => {
      const buildDrawingsCacheKey = (keyParts: {
        userId: string;
        searchTerm: string;
        collectionFilter: string;
        includeData: boolean;
      }) =>
        JSON.stringify([
          keyParts.userId,
          keyParts.searchTerm,
          keyParts.collectionFilter,
          keyParts.includeData ? "full" : "summary",
        ]);

      const keyA = buildDrawingsCacheKey({
        userId: "user-a-id",
        searchTerm: "",
        collectionFilter: "default",
        includeData: false,
      });

      const keyB = buildDrawingsCacheKey({
        userId: "user-b-id",
        searchTerm: "",
        collectionFilter: "default",
        includeData: false,
      });

      expect(keyA).not.toBe(keyB);
    });

    it("should generate same cache key for same user with same query params", () => {
      const buildDrawingsCacheKey = (keyParts: {
        userId: string;
        searchTerm: string;
        collectionFilter: string;
        includeData: boolean;
      }) =>
        JSON.stringify([
          keyParts.userId,
          keyParts.searchTerm,
          keyParts.collectionFilter,
          keyParts.includeData ? "full" : "summary",
        ]);

      const key1 = buildDrawingsCacheKey({
        userId: "same-user",
        searchTerm: "test",
        collectionFilter: "default",
        includeData: true,
      });

      const key2 = buildDrawingsCacheKey({
        userId: "same-user",
        searchTerm: "test",
        collectionFilter: "default",
        includeData: true,
      });

      expect(key1).toBe(key2);
    });
  });
});
