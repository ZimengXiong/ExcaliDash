#!/usr/bin/env node

/**
 * CLI admin password recovery for ExcaliDash.
 *
 * Examples:
 *   node scripts/admin-recover.cjs --identifier admin@example.com --password "NewStrongPassword!"
 *   node scripts/admin-recover.cjs --identifier admin@example.com --generate
 *
 * Notes:
 * - Works with SQLite DATABASE_URL (default: file:./prisma/dev.db).
 * - Sets the password hash and clears mustResetPassword by default.
 * - If there are no active admins, this script can promote the target user to ADMIN.
 */

require("dotenv").config();

const path = require("path");
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `file:${path.resolve(__dirname, "../prisma/dev.db")}`;

const { PrismaClient } = require("../src/generated/client");
const bcrypt = require("bcrypt");

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
};

const generatePassword = () => {
  const buf = require("crypto").randomBytes(18);
  return buf.toString("base64").replace(/[+/=]/g, "").slice(0, 24);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  const identifier =
    typeof args.identifier === "string" ? args.identifier.trim() : "";
  const providedPassword =
    typeof args.password === "string" ? args.password : null;
  const generate = Boolean(args.generate);
  const setMustReset = Boolean(args["must-reset"]);
  const activate = Boolean(args.activate);
  const promote = Boolean(args.promote);
  const disableLoginRateLimit = Boolean(args["disable-login-rate-limit"]);

  if (!identifier) {
    console.error("Missing --identifier (email or username).");
    process.exitCode = 2;
    return;
  }

  let newPassword = providedPassword;
  if (!newPassword) {
    if (!generate) {
      console.error('Provide --password "<new password>" or pass --generate.');
      process.exitCode = 2;
      return;
    }
    newPassword = generatePassword();
  }

  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const activeAdminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });

    const trimmed = identifier.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: trimmed }, { username: identifier }],
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        mustResetPassword: true,
      },
    });

    if (!user) {
      console.error("User not found:", identifier);
      process.exitCode = 1;
      return;
    }

    const shouldPromote = promote || activeAdminCount === 0;

    if (user.role !== "ADMIN" && !shouldPromote) {
      console.error(
        "Target user is not an ADMIN. Refusing to reset password for non-admin user.",
      );
      console.error(
        "Tip: pass --promote to promote this user to ADMIN, or use it only when there are 0 active admins.",
      );
      process.exitCode = 1;
      return;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    if (disableLoginRateLimit) {
      await prisma.systemConfig.upsert({
        where: { id: "default" },
        update: { authLoginRateLimitEnabled: false },
        create: {
          id: "default",
          authEnabled: true,
          registrationEnabled: false,
          authLoginRateLimitEnabled: false,
          authLoginRateLimitWindowMs: 15 * 60 * 1000,
          authLoginRateLimitMax: 20,
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustResetPassword: setMustReset ? true : false,
        isActive: activate ? true : user.isActive,
        role: shouldPromote ? "ADMIN" : user.role,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        mustResetPassword: true,
      },
    });

    console.log("Updated admin account:");
    console.log(`- id: ${updated.id}`);
    console.log(`- email: ${updated.email}`);
    console.log(`- username: ${updated.username || ""}`);
    console.log(`- isActive: ${updated.isActive}`);
    console.log(`- mustResetPassword: ${updated.mustResetPassword}`);
    console.log(`- role: ${updated.role}`);
    if (disableLoginRateLimit) {
      console.log("");
      console.log(
        "Login rate limiting: DISABLED (SystemConfig.authLoginRateLimitEnabled=false).",
      );
      console.log(
        "Remember to re-enable it from the Admin dashboard after you regain access.",
      );
    }
    if (generate || !providedPassword) {
      console.log("");
      console.log("New password:");
      console.log(newPassword);
    } else {
      console.log("");
      console.log("Password updated.");
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
};

main().catch((err) => {
  console.error("Admin recovery failed:", err);
  process.exitCode = 1;
});
