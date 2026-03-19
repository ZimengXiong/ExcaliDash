/**
 * Tests for audit logging utility
 * 
 * These tests verify that audit logging works correctly when enabled
 * and gracefully degrades when disabled or when tables don't exist.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { getTestPrisma, setupTestDb, initTestDb, createTestUser } from "../../__tests__/testUtils";
import {
  logAuditEvent,
  getAuditLogs,
  setAuditPrismaProvider,
  type AuditLogData,
} from "../audit";

describe("Audit Logging", () => {
  const prisma = getTestPrisma();
  let testUser: { id: string; email: string };

  beforeAll(async () => {
    await setupTestDb();
    testUser = await initTestDb(prisma);
    setAuditPrismaProvider(() => prisma);
    process.env.ENABLE_AUDIT_LOGGING = "true";
  });

  afterAll(async () => {
    setAuditPrismaProvider(null);
    await prisma.$disconnect();
    delete process.env.ENABLE_AUDIT_LOGGING;
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
  });

  describe("logAuditEvent", () => {
    it("should create an audit log entry when enabled", async () => {
      const auditData: AuditLogData = {
        userId: testUser.id,
        action: "test_action",
        resource: "test_resource",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
        details: { test: "value" },
      };

      await logAuditEvent(auditData);

      const logs = await prisma.auditLog.findMany({
        where: { userId: testUser.id, action: "test_action" },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe("test_action");
      expect(logs[0].resource).toBe("test_resource");
      expect(logs[0].ipAddress).toBe("127.0.0.1");
      expect(logs[0].userAgent).toBe("test-agent");
      expect(logs[0].details).toBe(JSON.stringify({ test: "value" }));
    });

    it("should handle audit log without userId", async () => {
      const auditData: AuditLogData = {
        action: "anonymous_action",
        ipAddress: "127.0.0.1",
      };

      await logAuditEvent(auditData);

      const logs = await prisma.auditLog.findMany({
        where: { action: "anonymous_action" },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].userId).toBeNull();
    });

    it("should handle audit log without optional fields", async () => {
      const auditData: AuditLogData = {
        action: "minimal_action",
      };

      await logAuditEvent(auditData);

      const logs = await prisma.auditLog.findMany({
        where: { action: "minimal_action" },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].resource).toBeNull();
      expect(logs[0].ipAddress).toBeNull();
      expect(logs[0].userAgent).toBeNull();
      expect(logs[0].details).toBeNull();
    });

    it("should gracefully handle when feature is disabled", async () => {
      const originalEnable = process.env.ENABLE_AUDIT_LOGGING;
      process.env.ENABLE_AUDIT_LOGGING = "false";
      try {
        vi.resetModules();
        const audit = await import("../audit");
        audit.setAuditPrismaProvider(() => prisma);

        await expect(audit.logAuditEvent({ action: "should_not_log_disabled" })).resolves.not.toThrow();
        const logs = await prisma.auditLog.findMany({
          where: { action: "should_not_log_disabled" },
        });
        expect(logs.length).toBe(0);
      } finally {
        if (typeof originalEnable === "string") {
          process.env.ENABLE_AUDIT_LOGGING = originalEnable;
        } else {
          delete process.env.ENABLE_AUDIT_LOGGING;
        }
        vi.resetModules();
        const audit = await import("../audit");
        audit.setAuditPrismaProvider(() => prisma);
        process.env.ENABLE_AUDIT_LOGGING = "true";
      }
    });

    it("should serialize details object to JSON", async () => {
      const complexDetails = {
        nested: { value: 123 },
        array: [1, 2, 3],
        string: "test",
      };

      await logAuditEvent({
        userId: testUser.id,
        action: "complex_details",
        details: complexDetails,
      });

      const logs = await prisma.auditLog.findMany({
        where: { action: "complex_details" },
      });

      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0].details || "{}");
      expect(parsed).toEqual(complexDetails);
    });
  });

  describe("getAuditLogs", () => {
    beforeEach(async () => {
      await prisma.auditLog.createMany({
        data: [
          {
            userId: testUser.id,
            action: "action_1",
            createdAt: new Date("2025-01-01T10:00:00Z"),
          },
          {
            userId: testUser.id,
            action: "action_2",
            createdAt: new Date("2025-01-01T11:00:00Z"),
          },
          {
            userId: testUser.id,
            action: "action_3",
            createdAt: new Date("2025-01-01T12:00:00Z"),
          },
        ],
      });
    });

    it("should retrieve audit logs for a specific user", async () => {
      const logs = await getAuditLogs(testUser.id);

      expect(logs.length).toBe(3);
      expect(logs[0].action).toBe("action_3"); // Most recent first
      expect(logs[1].action).toBe("action_2");
      expect(logs[2].action).toBe("action_1");
    });

    it("should retrieve all audit logs when userId is not provided", async () => {
      const otherUser = await createTestUser(prisma, "other@example.com");
      await prisma.auditLog.create({
        data: {
          userId: otherUser.id,
          action: "other_action",
        },
      });

      const logs = await getAuditLogs();

      expect(logs.length).toBeGreaterThanOrEqual(4);
    });

    it("should respect limit parameter", async () => {
      const logs = await getAuditLogs(testUser.id, 2);

      expect(logs.length).toBe(2);
    });

    it("should parse details JSON in returned logs", async () => {
      await prisma.auditLog.create({
        data: {
          userId: testUser.id,
          action: "with_details",
          details: JSON.stringify({ key: "value" }),
        },
      });

      const logs = await getAuditLogs(testUser.id, 1);

      expect(logs.length).toBe(1);
      expect((logs[0] as { details: unknown }).details).toEqual({ key: "value" });
    });

    it("should include user information in logs", async () => {
      const logs = await getAuditLogs(testUser.id, 1);

      expect(logs.length).toBe(1);
      const log = logs[0] as { user: { id: string; email: string; name: string } };
      expect(log.user).toBeDefined();
      expect(log.user.id).toBe(testUser.id);
      expect(log.user.email).toBe(testUser.email);
    });
  });
});
