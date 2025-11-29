import { Router, Request, Response } from "express";
import { z } from "zod";
// @ts-ignore
import { PrismaClient } from "../generated/client";
import { hashPassword, createSession } from "../auth";

const prisma = new PrismaClient();
const router = Router();

// Validation schema for admin setup
const setupAdminSchema = z.object({
  email: z.string().email("Invalid email format"),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(100).optional(),
});

// GET /setup/status - Check if initial setup is needed
router.get("/status", async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    const needsSetup = userCount === 0;

    res.json({
      needsSetup,
      message: needsSetup
        ? "No users found. Please create an admin account."
        : "Setup complete. Application is ready.",
    });
  } catch (error) {
    console.error("Setup status error:", error);
    res.status(500).json({ error: "Failed to check setup status" });
  }
});

// POST /setup/admin - Create initial admin account
router.post("/admin", async (req: Request, res: Response) => {
  try {
    // Check if any users exist
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(400).json({
        error: "Setup already complete",
        message: "An admin account already exists. Please use the login page.",
      });
    }

    // Validate input
    const validation = setupAdminSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { email, username, password, displayName } = validation.data;

    // Check if email already exists (shouldn't happen but just in case)
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      return res.status(409).json({ error: "Username already taken" });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        displayName: displayName || username,
        role: "ADMIN", // First user is always admin
      },
      select: {
        id: true,
        email: true,
        username: true,
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
      message: "Admin account created successfully",
      user,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error("Setup admin error:", error);
    res.status(500).json({ error: "Failed to create admin account" });
  }
});

export default router;
