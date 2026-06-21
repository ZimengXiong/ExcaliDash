import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../auth/cookies";

describe("Link Sharing - Public By Drawing ID", () => {
  const userAgent = "vitest-link-sharing-public";
  const createRefreshToken = (user: { id: string; email: string }) =>
    jwt.sign(
      { userId: user.id, email: user.email, type: "refresh" },
      config.jwtSecret,
      { expiresIn: config.jwtRefreshExpiresIn as StringValue }
    );

  let prisma: PrismaClient;
  let app: any;

  let ownerUser: { id: string; email: string };
  let ownerToken: string;

  let ownerAgent: any;
  let ownerCsrfHeaderName: string;
  let ownerCsrfToken: string;

  const createDrawing = async () => {
    return prisma.drawing.create({
      data: {
        name: "Shared Drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: ownerUser.id,
        collectionId: null,
        preview: null,
      },
      select: { id: true, userId: true, name: true },
    });
  };

  const createLinkShare = async (
    drawingId: string,
    permission: "view" | "edit"
  ) => {
    const response = await ownerAgent
      .post(`/drawings/${drawingId}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission });

    expect(response.status).toBe(200);
    return response;
  };

  const createAnonymousAgentWithCsrf = async () => {
    const anonAgent = request.agent(app);
    const anonCsrfRes = await anonAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);

    return {
      anonAgent,
      anonCsrfHeaderName: anonCsrfRes.body.header as string,
      anonCsrfToken: anonCsrfRes.body.token as string,
    };
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();

    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: true,
        registrationEnabled: false,
      },
      create: {
        id: "default",
        authEnabled: true,
        registrationEnabled: false,
      },
    });

    const passwordHash = await bcrypt.hash("password123", 10);
    ownerUser = await prisma.user.create({
      data: {
        email: "owner-user@test.local",
        passwordHash,
        name: "Owner User",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    ownerToken = jwt.sign(
      { userId: ownerUser.id, email: ownerUser.email, type: "access" },
      config.jwtSecret,
      signOptions
    );

    ownerAgent = request.agent(app);
    const csrfRes = await ownerAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    ownerCsrfHeaderName = csrfRes.body.header;
    ownerCsrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows anonymous GET when link-share policy is view", async () => {
    const drawing = await createDrawing();
    await createLinkShare(drawing.id, "view");

    const anonGet = await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent);
    expect(anonGet.status).toBe(200);
    expect(anonGet.body?.id).toBe(drawing.id);
    expect(anonGet.body?.accessLevel).toBe("view");

    const { anonAgent, anonCsrfHeaderName, anonCsrfToken } =
      await createAnonymousAgentWithCsrf();

    const anonPut = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Should Not Save" });
    expect(anonPut.status).toBe(404);
  });

  it("still allows anonymous GET when a stale access-token cookie is present", async () => {
    const drawing = await createDrawing();
    await createLinkShare(drawing.id, "view");

    const response = await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${ACCESS_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      );

    expect(response.status).toBe(200);
    expect(response.body?.id).toBe(drawing.id);
    expect(response.body?.accessLevel).toBe("view");
  });

  it("still allows anonymous GET when only a refresh-token cookie is present", async () => {
    const drawing = await createDrawing();
    await createLinkShare(drawing.id, "view");

    const response = await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${REFRESH_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      );

    expect(response.status).toBe(200);
    expect(response.body?.id).toBe(drawing.id);
    expect(response.body?.accessLevel).toBe("view");
  });

  it("allows anonymous PUT when link-share policy is edit", async () => {
    const drawing = await createDrawing();
    await createLinkShare(drawing.id, "edit");
    const { anonAgent, anonCsrfHeaderName, anonCsrfToken } =
      await createAnonymousAgentWithCsrf();

    const anonPut = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Renamed By Anonymous" });
    expect(anonPut.status).toBe(200);
    expect(anonPut.body?.id).toBe(drawing.id);
    expect(anonPut.body?.name).toBe("Renamed By Anonymous");
  });

  it("still allows anonymous PUT when edit link-share is active and a stale access-token cookie is present", async () => {
    const drawing = await createDrawing();
    await createLinkShare(drawing.id, "edit");
    const { anonAgent, anonCsrfHeaderName, anonCsrfToken } =
      await createAnonymousAgentWithCsrf();

    const response = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${ACCESS_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      )
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Edited With Stale Cookie" });

    expect(response.status).toBe(200);
    expect(response.body?.id).toBe(drawing.id);
    expect(response.body?.name).toBe("Edited With Stale Cookie");
  });

  it("still allows anonymous PUT when only a refresh-token cookie is present", async () => {
    const drawing = await createDrawing();
    await createLinkShare(drawing.id, "edit");
    const { anonAgent, anonCsrfHeaderName, anonCsrfToken } =
      await createAnonymousAgentWithCsrf();

    const response = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${REFRESH_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      )
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Edited With Refresh Cookie" });

    expect(response.status).toBe(200);
    expect(response.body?.id).toBe(drawing.id);
    expect(response.body?.name).toBe("Edited With Refresh Cookie");
  });

  it("returns 401 for a private drawing when a stale access-token cookie is present", async () => {
    const drawing = await createDrawing();

    const response = await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${ACCESS_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      );

    expect(response.status).toBe(401);
    expect(response.body?.message).toBe("Invalid or expired token");
  });

  it("returns 401 for a private drawing when only a refresh-token cookie is present", async () => {
    const drawing = await createDrawing();

    const response = await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${REFRESH_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      );

    expect(response.status).toBe(401);
    expect(response.body?.message).toBe("Invalid or expired token");
  });

  it("returns 401 for a private drawing PUT when a stale access-token cookie is present", async () => {
    const drawing = await createDrawing();
    const { anonAgent, anonCsrfHeaderName, anonCsrfToken } =
      await createAnonymousAgentWithCsrf();

    const response = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(
        "Cookie",
        `${ACCESS_TOKEN_COOKIE_NAME}=${createRefreshToken(ownerUser)}`
      )
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Should Fail" });

    expect(response.status).toBe(401);
    expect(response.body?.message).toBe("Invalid or expired token");
  });

  it("revokes previous active link-share when creating a new one", async () => {
    const drawing = await createDrawing();

    const first = await ownerAgent
      .post(`/drawings/${drawing.id}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission: "view" });
    expect(first.status).toBe(200);
    const firstShareId = first.body?.share?.id as string;
    expect(typeof firstShareId).toBe("string");

    const second = await ownerAgent
      .post(`/drawings/${drawing.id}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission: "edit" });
    expect(second.status).toBe(200);

    const firstRow = await prisma.drawingLinkShare.findUnique({
      where: { id: firstShareId },
      select: { revokedAt: true },
    });
    expect(firstRow?.revokedAt).not.toBeNull();

    const activeCount = await prisma.drawingLinkShare.count({
      where: { drawingId: drawing.id, revokedAt: null },
    });
    expect(activeCount).toBe(1);
  });
});
