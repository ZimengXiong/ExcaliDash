import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
// @ts-ignore
import { PrismaClient } from "./generated/client";

const prisma = new PrismaClient();

// Role type (using string since SQLite doesn't support enums)
export type Role = "ADMIN" | "USER";

// Configuration
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SALT_ROUNDS = 12;

// Types
export interface JWTPayload {
  userId: string;
  email: string;
  role: Role;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    role: Role;
    isActive: boolean;
  };
  sessionId?: string;
}

// Password hashing
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// JWT token generation
export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
};

// Parse expiration string to milliseconds
const parseExpiresIn = (expiresIn: string): number => {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
};

// Session management
export const createSession = async (
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ token: string; expiresAt: Date }> => {
  const expiresAt = new Date(
    Date.now() + parseExpiresIn(JWT_EXPIRES_IN as string)
  );

  const session = await prisma.session.create({
    data: {
      userId,
      token: crypto.randomUUID(),
      expiresAt,
      userAgent,
      ipAddress,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });

  if (!user) throw new Error("User not found");

  const jwtToken = generateToken({
    userId,
    email: user.email,
    role: user.role as Role,
    sessionId: session.id,
  });

  // Update last login
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return { token: jwtToken, expiresAt };
};

export const invalidateSession = async (sessionId: string): Promise<void> => {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
};

export const invalidateAllUserSessions = async (
  userId: string
): Promise<void> => {
  await prisma.session.deleteMany({ where: { userId } });
};

// Middleware: Authenticate request
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Verify session exists and is not expired
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await invalidateSession(session.id);
      return res.status(401).json({ error: "Session expired" });
    }

    if (!session.user.isActive) {
      return res.status(403).json({ error: "Account is disabled" });
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      displayName: session.user.displayName,
      role: session.user.role as Role,
      isActive: session.user.isActive,
    };
    req.sessionId = session.id;

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
};

// Middleware: Optional authentication (doesn't fail if no token)
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload) {
      return next();
    }

    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (session && session.expiresAt >= new Date() && session.user.isActive) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        displayName: session.user.displayName,
        role: session.user.role as Role,
        isActive: session.user.isActive,
      };
      req.sessionId = session.id;
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

// Middleware: Require admin role
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
};

// Validation helpers
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidUsername = (username: string): boolean => {
  // 3-30 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
};

export const isValidPassword = (password: string): boolean => {
  // Minimum 8 characters, at least one letter and one number
  return (
    password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)
  );
};

// Clean up expired sessions (can be called periodically)
export const cleanupExpiredSessions = async (): Promise<number> => {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
};
