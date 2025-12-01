import { Router, Response } from "express";
import { z } from "zod";
// @ts-ignore
import { PrismaClient } from "../generated/client";
import {
  authenticate,
  requireAdmin,
  hashPassword,
  invalidateAllUserSessions,
  cleanupExpiredSessions,
  AuthenticatedRequest,
} from "../auth";

const prisma = new PrismaClient();
const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// Validation schema for user updates
const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional().nullable(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// GET /admin/stats - Get system statistics
router.get("/stats", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      userCount,
      activeUserCount,
      drawingCount,
      collectionCount,
      sessionCount,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.drawing.count(),
      // Exclude system collections (Trash, etc.) that have no userId
      prisma.collection.count({ where: { userId: { not: null } } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    res.json({
      stats: {
        users: {
          total: userCount,
          active: activeUserCount,
          inactive: userCount - activeUserCount,
        },
        content: {
          drawings: drawingCount,
          collections: collectionCount,
        },
        sessions: {
          active: sessionCount,
        },
        recentUsers,
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

// GET /admin/users - List all users
router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, role, isActive, page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search as string } },
        { username: { contains: search as string } },
        { displayName: { contains: search as string } },
      ];
    }
    if (role && ["ADMIN", "USER"].includes(role as string)) {
      where.role = role;
    }
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              drawings: true,
              collections: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// GET /admin/users/:id - Get user details
router.get("/users/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            drawings: true,
            collections: true,
            sessions: true,
          },
        },
        drawings: {
          take: 10,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            updatedAt: true,
          },
        },
        collections: {
          take: 10,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            _count: {
              select: { drawings: true },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// PUT /admin/users/:id - Update user
router.put("/users/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { displayName, email, role, isActive, password } = validation.data;

    // Check user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true },
    });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check email uniqueness if changing
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (emailTaken) {
        return res.status(400).json({ error: "Email already in use" });
      }
    }

    // Prevent demoting the last admin
    if (role === "USER" && existingUser.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot demote the last admin" });
      }
    }

    // Prevent deactivating the last admin
    if (isActive === false && existingUser.role === "ADMIN") {
      const activeAdminCount = await prisma.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (activeAdminCount <= 1) {
        return res
          .status(400)
          .json({ error: "Cannot deactivate the last active admin" });
      }
    }

    // Build update data
    const updateData: any = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.passwordHash = await hashPassword(password);

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
      },
    });

    // If deactivating user, invalidate all their sessions
    if (isActive === false) {
      await invalidateAllUserSessions(id);
    }

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /admin/users/:id - Delete user
router.delete(
  "/users/:id",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Prevent self-deletion
      if (req.user?.id === id) {
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent deleting the last admin
      if (user.role === "ADMIN") {
        const adminCount = await prisma.user.count({
          where: { role: "ADMIN" },
        });
        if (adminCount <= 1) {
          return res
            .status(400)
            .json({ error: "Cannot delete the last admin" });
        }
      }

      // Delete user (cascades to drawings, collections, sessions)
      await prisma.user.delete({ where: { id } });

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

// POST /admin/users/:id/reset-password - Reset user password
router.post(
  "/users/:id/reset-password",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters" });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const passwordHash = await hashPassword(password);
      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      // Invalidate all user sessions
      await invalidateAllUserSessions(id);

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);

// POST /admin/users/:id/logout-all - Force logout all sessions for a user
router.post(
  "/users/:id/logout-all",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await invalidateAllUserSessions(id);
      res.json({ message: "All sessions invalidated successfully" });
    } catch (error) {
      console.error("Logout all error:", error);
      res.status(500).json({ error: "Failed to logout all sessions" });
    }
  }
);

// POST /admin/cleanup-sessions - Clean up expired sessions
router.post(
  "/cleanup-sessions",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const count = await cleanupExpiredSessions();
      res.json({ message: `Cleaned up ${count} expired sessions` });
    } catch (error) {
      console.error("Cleanup sessions error:", error);
      res.status(500).json({ error: "Failed to cleanup sessions" });
    }
  }
);

// GET /admin/drawings - List all drawings with user info (admin view)
router.get("/drawings", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, userId, page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.name = { contains: search as string };
    }
    if (userId) {
      where.userId = userId as string;
    }

    const [drawings, total] = await Promise.all([
      prisma.drawing.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          isPublic: true,
          isLocked: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          collection: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.drawing.count({ where }),
    ]);

    res.json({
      drawings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("List drawings error:", error);
    res.status(500).json({ error: "Failed to list drawings" });
  }
});

export default router;
