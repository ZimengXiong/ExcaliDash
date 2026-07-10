import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

// A minimal, well-formed tldraw document snapshot: getSnapshot(store).document.
const validTldrawDocument = () => ({
  store: {
    "document:document": { id: "document:document", typeName: "document" },
    "page:page": { id: "page:page", typeName: "page", name: "Page 1" },
    "shape:box1": {
      id: "shape:box1",
      typeName: "shape",
      type: "geo",
      x: 10,
      y: 10,
    },
  },
  schema: { schemaVersion: 2, sequences: {} },
});

describe("Drawings - dual engine (excalidraw + tldraw)", () => {
  const userAgent = "vitest-drawings-engine";
  let prisma: PrismaClient;
  let app: any;
  let owner: { id: string; email: string };
  let token: string;

  const tokenFor = (id: string, email: string) => {
    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign(
      { userId: id, email, type: "access" },
      config.jwtSecret,
      signOptions,
    );
  };

  // supertest agent primed with a CSRF token, required for state-changing verbs.
  const agentWithCsrf = async () => {
    const agent = request.agent(app);
    const res = await agent.get("/csrf-token").set("User-Agent", userAgent);
    return {
      agent,
      csrfHeader: res.body.header as string,
      csrfToken: res.body.token as string,
    };
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });
  });

  beforeEach(async () => {
    await prisma.drawing.deleteMany({});
    await prisma.user.deleteMany({});
    const passwordHash = await bcrypt.hash("password123", 10);
    owner = await prisma.user.create({
      data: { email: "owner-e@test.local", passwordHash, name: "Owner" },
      select: { id: true, email: true },
    });
    token = tokenFor(owner.id, owner.email);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const post = async (body: unknown, extraHeaders: Record<string, string> = {}) => {
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    return agent
      .post("/drawings")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", userAgent)
      .set(csrfHeader, csrfToken)
      .set(extraHeaders)
      .send(body as any);
  };

  const put = async (id: string, body: unknown) => {
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    return agent
      .put(`/drawings/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", userAgent)
      .set(csrfHeader, csrfToken)
      .send(body as any);
  };

  describe("create", () => {
    it("defaults to excalidraw when engine is omitted", async () => {
      const res = await post({ name: "Untitled", elements: [], appState: {} });
      expect(res.status).toBe(200);
      expect(res.body.engine).toBe("excalidraw");
      const row = await prisma.drawing.findUnique({ where: { id: res.body.id } });
      expect(row?.engine).toBe("excalidraw");
    });

    it("creates a tldraw drawing and stores the document verbatim", async () => {
      const doc = validTldrawDocument();
      const res = await post({ name: "TL", engine: "tldraw", elements: doc, appState: {} });
      expect(res.status).toBe(200);
      expect(res.body.engine).toBe("tldraw");
      expect(res.body.elements).toEqual(doc);
      const row = await prisma.drawing.findUnique({ where: { id: res.body.id } });
      expect(row?.engine).toBe("tldraw");
      expect(JSON.parse(row!.elements)).toEqual(doc);
      expect(row!.files).toBe("{}");
    });

    it("rejects an unknown engine value", async () => {
      const res = await post({ engine: "figma", elements: [], appState: {} });
      expect(res.status).toBe(400);
    });

    it("rejects a tldraw scene of the wrong shape (array elements)", async () => {
      const res = await post({ engine: "tldraw", elements: [], appState: {} });
      expect(res.status).toBe(400);
    });

    it("rejects a tldraw scene with unknown top-level keys", async () => {
      const res = await post({
        engine: "tldraw",
        elements: { ...validTldrawDocument(), extra: 1 },
        appState: {},
      });
      expect(res.status).toBe(400);
    });

    it("rejects a tldraw scene carrying non-empty files", async () => {
      const res = await post({
        engine: "tldraw",
        elements: validTldrawDocument(),
        appState: {},
        files: { "file-1": { id: "file-1", dataURL: "data:image/png;base64,AAAA" } },
      });
      expect(res.status).toBe(400);
    });

    it("rejects an oversized tldraw scene with 413 TLDRAW_SCENE_TOO_LARGE", async () => {
      const doc = validTldrawDocument() as any;
      // Pad past the 15MB default cap.
      doc.store["shape:big"] = {
        id: "shape:big",
        typeName: "shape",
        blob: "x".repeat(16 * 1024 * 1024),
      };
      const res = await post({ engine: "tldraw", elements: doc, appState: {} });
      expect(res.status).toBe(413);
      expect(res.body.code).toBe("TLDRAW_SCENE_TOO_LARGE");
    });

    it("sanitizes a tldraw preview through sanitizeSvg", async () => {
      const preview =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect x="0" y="0" width="5" height="5"></rect></svg>';
      const res = await post({
        engine: "tldraw",
        elements: validTldrawDocument(),
        appState: {},
        preview,
      });
      expect(res.status).toBe(200);
      const row = await prisma.drawing.findUnique({ where: { id: res.body.id } });
      expect(row?.preview).not.toContain("<script>");
      expect(row?.preview).toContain("<rect");
    });
  });

  describe("update / engine immutability", () => {
    it("updates a tldraw scene and bumps the version", async () => {
      const created = await post({ engine: "tldraw", elements: validTldrawDocument(), appState: {} });
      const id = created.body.id as string;
      const nextDoc = validTldrawDocument() as any;
      nextDoc.store["shape:box2"] = { id: "shape:box2", typeName: "shape", type: "geo" };
      const res = await put(id, { engine: "tldraw", elements: nextDoc, appState: {}, version: created.body.version });
      expect(res.status).toBe(200);
      expect(res.body.engine).toBe("tldraw");
      expect(res.body.elements.store["shape:box2"]).toBeTruthy();
      expect(res.body.version).toBe(created.body.version + 1);
    });

    it("ignores an engine field in the update body (immutable)", async () => {
      const created = await post({ name: "keep", elements: [], appState: {} });
      const id = created.body.id as string;
      // Send engine:"tldraw" plus a valid excalidraw scene; engine must not change.
      const res = await put(id, { engine: "tldraw", name: "renamed" });
      expect(res.status).toBe(200);
      const row = await prisma.drawing.findUnique({ where: { id } });
      expect(row?.engine).toBe("excalidraw");
    });

    it("rejects a tldraw-shaped scene sent to an excalidraw row", async () => {
      const created = await post({ elements: [], appState: {} });
      const id = created.body.id as string;
      const res = await put(id, { elements: validTldrawDocument(), appState: {} });
      expect(res.status).toBe(400);
    });

    it("rejects an excalidraw-shaped scene sent to a tldraw row", async () => {
      const created = await post({ engine: "tldraw", elements: validTldrawDocument(), appState: {} });
      const id = created.body.id as string;
      const res = await put(id, { elements: [], appState: {} });
      expect(res.status).toBe(400);
    });
  });

  describe("duplicate", () => {
    it("copies the engine onto the duplicated row", async () => {
      const created = await post({ engine: "tldraw", elements: validTldrawDocument(), appState: {} });
      const id = created.body.id as string;
      const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
      const res = await agent
        .post(`/drawings/${id}/duplicate`)
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", userAgent)
        .set(csrfHeader, csrfToken)
        .send();
      expect(res.status).toBe(200);
      expect(res.body.engine).toBe("tldraw");
      const row = await prisma.drawing.findUnique({ where: { id: res.body.id } });
      expect(row?.engine).toBe("tldraw");
    });
  });

  describe("agent endpoints ENGINE_MISMATCH", () => {
    const get = async (path: string) => {
      const { agent } = await agentWithCsrf();
      return agent
        .get(path)
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", userAgent);
    };

    it("returns 409 ENGINE_MISMATCH from the summary read path", async () => {
      const created = await post({ engine: "tldraw", elements: validTldrawDocument(), appState: {} });
      const res = await get(`/drawings/${created.body.id}/summary`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ENGINE_MISMATCH");
    });

    it("returns 409 ENGINE_MISMATCH from the ops apply path", async () => {
      const created = await post({ engine: "tldraw", elements: validTldrawDocument(), appState: {} });
      const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
      const res = await agent
        .post(`/drawings/${created.body.id}/ops`)
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", userAgent)
        .set(csrfHeader, csrfToken)
        .send({ ops: [] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ENGINE_MISMATCH");
    });

    it("still serves excalidraw drawings on the summary path", async () => {
      const created = await post({ elements: [], appState: {} });
      const res = await get(`/drawings/${created.body.id}/summary`);
      expect(res.status).toBe(200);
    });
  });

  describe("excalidraw regression", () => {
    it("creates and updates an excalidraw drawing unchanged", async () => {
      const element = {
        id: "rect-1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        angle: 0,
        version: 1,
        versionNonce: 1,
      };
      const created = await post({
        name: "Excali",
        elements: [element],
        appState: { viewBackgroundColor: "#ffffff" },
      });
      expect(created.status).toBe(200);
      expect(created.body.engine).toBe("excalidraw");
      expect(Array.isArray(created.body.elements)).toBe(true);
      expect(created.body.elements[0].id).toBe("rect-1");

      const res = await put(created.body.id, {
        elements: [{ ...element, width: 200 }],
        appState: { viewBackgroundColor: "#ffffff" },
        version: created.body.version,
      });
      expect(res.status).toBe(200);
      expect(res.body.elements[0].width).toBe(200);
      expect(res.body.version).toBe(created.body.version + 1);
    });
  });
});
