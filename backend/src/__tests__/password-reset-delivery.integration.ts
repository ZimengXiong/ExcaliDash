import { afterAll, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("password reset delivery", () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: any;
  let smtp: net.Server;
  let delivered: string | null = null;
  const email = "reset-delivery@example.test";

  beforeAll(async () => {
    smtp = net.createServer((socket) => {
      let pending = "";
      let message: string[] | null = null;
      socket.write("220 localhost test mail\r\n");
      socket.on("error", () => {});
      socket.on("data", (chunk) => {
        pending += chunk.toString();
        while (pending.includes("\r\n")) {
          const end = pending.indexOf("\r\n");
          const line = pending.slice(0, end);
          pending = pending.slice(end + 2);
          if (message) {
            if (line === ".") {
              delivered = message.join("\r\n");
              message = null;
              socket.write("250 accepted\r\n");
            } else message.push(line.replace(/^\.\./, "."));
          } else if (/^DATA$/i.test(line)) {
            message = [];
            socket.write("354 send message\r\n");
          } else if (/^QUIT$/i.test(line)) socket.end("221 bye\r\n");
          else socket.write("250 localhost\r\n");
        }
      });
    });
    await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
    const address = smtp.address() as net.AddressInfo;
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.MAIL_FROM = "ExcaliDash <no-reply@example.test>";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(address.port);
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "";
    process.env.SMTP_PASSWORD = "";
    process.env.ENABLE_PASSWORD_RESET = "true";
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true },
      create: { id: "default", authEnabled: true },
    });
    await prisma.user.create({
      data: {
        email,
        name: "Reset User",
        passwordHash: await bcrypt.hash("Old-Password-123!", 10),
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (smtp?.listening)
      await new Promise<void>((resolve) => smtp.close(() => resolve()));
  });

  it("delivers a usable reset link over SMTP without exposing or storing the raw token", async () => {
    const agent = request.agent(app);
    const csrf = await agent.get("/csrf-token");
    const post = (route: string, body: object) =>
      agent.post(route).set(csrf.body.header, csrf.body.token).send(body);
    const response = await post("/auth/password-reset-request", { email });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeUndefined();
    await expect.poll(() => delivered, { timeout: 10000 }).not.toBeNull();
    const decoded = delivered!.replace(/=\r\n/g, "").replace(/=3D/g, "=");
    const token = /reset-password-confirm#token=([a-f0-9]{64})/.exec(
      decoded,
    )?.[1];
    expect(token).toBeTruthy();
    expect(decoded).toContain(email);
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.token).toBe(
      crypto.createHash("sha256").update(token!).digest("hex"),
    );
    expect(stored.token).not.toBe(token);
    const password = "New-Password-789!";
    const confirmed = await post("/auth/password-reset-confirm", {
      token,
      password,
    });
    expect(confirmed.status).toBe(200);
    expect(
      (await post("/auth/login", { email, password: "Old-Password-123!" }))
        .status,
    ).toBe(401);
    expect((await post("/auth/login", { email, password })).status).toBe(200);
    expect(
      (await post("/auth/password-reset-confirm", { token, password })).status,
    ).toBe(400);
  });
});
