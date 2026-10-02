import type { FullConfig } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { owner, viewer } from "./fixtures/auth";

const API_URL = process.env.API_URL || "http://localhost:8000";
const TEST_USER_ID = owner.id;
const TEST_EMAIL = owner.email;
const TEST_PASSWORD = owner.password;

const waitForBackend = async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${API_URL}/health`)).ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for backend health at ${API_URL}/health`);
};

export default async function globalSetup(_config: FullConfig) {
  if (!["127.0.0.1", "localhost"].includes(new URL(API_URL).hostname)) {
    throw new Error("Authenticated fixtures require the local test backend.");
  }
  await waitForBackend();

  const backendRoot = path.resolve(__dirname, "../backend");
  const backendRequire = createRequire(path.join(backendRoot, "package.json"));
  const bcrypt = backendRequire("bcrypt") as {
    hash(value: string, rounds: number): Promise<string>;
  };
  const { PrismaClient } = backendRequire("./src/generated/client") as {
    PrismaClient: new () => any;
  };
  process.env.DATABASE_URL = `file:${path.join(
    backendRoot,
    "prisma/auth-e2e.db",
  )}`;

  const prisma = new PrismaClient();
  try {
    const viewerData = {
      email: viewer.email,
      passwordHash: await bcrypt.hash(viewer.password, 10),
      name: "E2E Viewer",
      role: "USER",
      isActive: true,
      mustResetPassword: false,
    };
    await prisma.user.upsert({
      where: { id: viewer.id },
      update: viewerData,
      create: { id: viewer.id, ...viewerData },
    });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
      },
      create: {
        id: "default",
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
      },
    });
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {
        email: TEST_EMAIL,
        passwordHash,
        name: "E2E Admin",
        role: "ADMIN",
        isActive: true,
        mustResetPassword: false,
      },
      create: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        passwordHash,
        name: "E2E Admin",
        role: "ADMIN",
        isActive: true,
        mustResetPassword: false,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export const authE2eCredentials = {
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
};
