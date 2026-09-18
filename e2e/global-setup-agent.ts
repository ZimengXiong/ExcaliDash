import type { FullConfig } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const API_URL = process.env.API_URL || "http://localhost:8000";
const TEST_USER_ID = "agent-e2e-admin";
const TEST_EMAIL = "agent-e2e@example.test";
const TEST_PASSWORD = "Agent-E2E-Password-123!";

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
    "prisma/agent-e2e.db",
  )}`;

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
        aiProvider: "chatgpt",
        aiChatgptEnabled: true,
      },
      create: {
        id: "default",
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
        aiProvider: "chatgpt",
        aiChatgptEnabled: true,
      },
    });
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {
        email: TEST_EMAIL,
        passwordHash,
        name: "Agent E2E Admin",
        role: "ADMIN",
        isActive: true,
        mustResetPassword: false,
      },
      create: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        passwordHash,
        name: "Agent E2E Admin",
        role: "ADMIN",
        isActive: true,
        mustResetPassword: false,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export const agentE2eCredentials = {
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
};
