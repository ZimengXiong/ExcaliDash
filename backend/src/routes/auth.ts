import { Router, Response } from "express";
import { z } from "zod";
// @ts-ignore
import { PrismaClient } from "../generated/client";
import {
  hashPassword,
  verifyPassword,
  createSession,
  invalidateSession,
  invalidateAllUserSessions,
  AuthenticatedRequest,
  authenticate,
} from "../auth";

const prisma = new PrismaClient();
const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    )
    .optional(), // Made optional - will auto-generate from email if not provided
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    email: z.string().email("Invalid email format").optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine(
    (data) => {
      // If changing password, both current and new password are required
      if (data.newPassword && !data.currentPassword) return false;
      if (data.currentPassword && !data.newPassword) return false;
      return true;
    },
    {
      message: "Both current and new password are required to change password",
    }
  );

// POST /auth/register - Register a new user
router.post("/register", async (req, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { email, password, displayName } = validation.data;
    
    // Auto-generate username from email (part before @)
    let username = validation.data.username || email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 30);
    
    // Ensure username is at least 3 characters
    if (username.length < 3) {
      username = username + "_user";
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Check if username already exists and make unique if needed
    let existingUsername = await prisma.user.findUnique({
      where: { username },
    });
    let counter = 1;
    const baseUsername = username;
    while (existingUsername) {
      username = `${baseUsername}${counter}`;
      existingUsername = await prisma.user.findUnique({
        where: { username },
      });
      counter++;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Check if this is the first user (make them admin)
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        displayName: displayName || email.split("@")[0],
        role: isFirstUser ? "ADMIN" : "USER",
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    // Create session
    const { token, expiresAt } = await createSession(
      user.id,
      req.headers["user-agent"] || "unknown",
      req.ip || "unknown"
    );

    res.status(201).json({
      message: "Registration successful",
      user,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/login - Login with email
router.post("/login", async (req, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    // Verify password
    const isValidPasswordMatch = await verifyPassword(
      password,
      user.passwordHash
    );
    if (!isValidPasswordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create session
    const { token, expiresAt } = await createSession(
      user.id,
      req.headers["user-agent"] || "unknown",
      req.ip || "unknown"
    );

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      token,
      expiresAt,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /auth/logout - Logout current session
router.post(
  "/logout",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.sessionId) {
        await invalidateSession(req.sessionId);
      }
      res.json({ message: "Logout successful" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  }
);

// POST /auth/logout-all - Logout all sessions
router.post(
  "/logout-all",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user) {
        await invalidateAllUserSessions(req.user.id);
      }
      res.json({ message: "All sessions logged out successfully" });
    } catch (error) {
      console.error("Logout all error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  }
);

// GET /auth/me - Get current user info
router.get(
  "/me",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user?.id },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              drawings: true,
              collections: true,
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
      res.status(500).json({ error: "Failed to get user info" });
    }
  }
);

// PUT /auth/profile - Update current user profile
router.put(
  "/profile",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validation.error.issues,
        });
      }

      const { displayName, email, currentPassword, newPassword } = validation.data;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const updateData: any = {};

      // Update display name if provided
      if (displayName !== undefined) {
        updateData.displayName = displayName;
      }

      // Update email if provided
      if (email !== undefined) {
        // Check if email is already taken by another user
        const existingEmail = await prisma.user.findFirst({
          where: { 
            email,
            NOT: { id: userId }
          },
        });
        if (existingEmail) {
          return res.status(409).json({ error: "Email already in use" });
        }
        updateData.email = email;
      }

      // Change password if provided
      if (currentPassword && newPassword) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true },
        });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const isValidCurrentPassword = await verifyPassword(
          currentPassword,
          user.passwordHash
        );
        if (!isValidCurrentPassword) {
          return res
            .status(400)
            .json({ error: "Current password is incorrect" });
        }

        updateData.passwordHash = await hashPassword(newPassword);
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          updatedAt: true,
        },
      });

      res.json({
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  }
);

// GET /auth/sessions - Get current user's active sessions
router.get(
  "/sessions",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessions = await prisma.session.findMany({
        where: {
          userId: req.user?.id,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        sessions: sessions.map((s) => ({
          ...s,
          isCurrent: s.id === req.sessionId,
        })),
      });
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  }
);

// DELETE /auth/sessions/:id - Revoke a specific session
router.delete(
  "/sessions/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Make sure the session belongs to the current user
      const session = await prisma.session.findFirst({
        where: {
          id,
          userId: req.user?.id,
        },
      });

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      await invalidateSession(id);
      res.json({ message: "Session revoked successfully" });
    } catch (error) {
      console.error("Delete session error:", error);
      res.status(500).json({ error: "Failed to revoke session" });
    }
  }
);

export default router;
