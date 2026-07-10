import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "../generated/client";
import { config, authModeEnablesAuth } from "../config";
import {
  BOOTSTRAP_USER_ID,
  DEFAULT_SYSTEM_CONFIG_ID,
  createAuthModeService,
} from "./authMode";

const createPrismaMock = () =>
  ({
    systemConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
  }) as unknown as PrismaClient;

describe("authMode service", () => {
  let now = 1_000_000;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("caches authEnabled reads within TTL", async () => {
    const prisma = createPrismaMock();
    const findUnique = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;
    const upsert = prisma.systemConfig.upsert as unknown as ReturnType<typeof vi.fn>;
    findUnique
      .mockResolvedValueOnce({ authEnabled: true })
      .mockResolvedValueOnce({ authEnabled: false });

    const service = createAuthModeService(prisma, { authEnabledTtlMs: 5000 });

    await expect(service.getAuthEnabled()).resolves.toBe(true);

    now += 1000;
    await expect(service.getAuthEnabled()).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);

    now += 6000;
    await expect(service.getAuthEnabled()).resolves.toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("clears auth cache when requested", async () => {
    const prisma = createPrismaMock();
    const findUnique = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;
    const upsert = prisma.systemConfig.upsert as unknown as ReturnType<typeof vi.fn>;
    findUnique.mockResolvedValue({ authEnabled: true });

    const service = createAuthModeService(prisma);
    await service.getAuthEnabled();
    service.clearAuthEnabledCache();
    await service.getAuthEnabled();

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("falls back to upsert when system config row is missing", async () => {
    const prisma = createPrismaMock();
    const findUnique = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;
    const upsert = prisma.systemConfig.upsert as unknown as ReturnType<typeof vi.fn>;
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({ authEnabled: false });

    const service = createAuthModeService(prisma);
    await expect(service.getAuthEnabled()).resolves.toBe(false);

    // getAuthEnabled reads once (authEnabled-only); on a miss it delegates
    // to ensureSystemConfig, which now reads-first as well before falling
    // back to upsert — two reads total, but still a single write.
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("creates/bootstrap user via upsert", async () => {
    const prisma = createPrismaMock();
    const userUpsert = prisma.user.upsert as unknown as ReturnType<typeof vi.fn>;
    userUpsert.mockResolvedValue({
      id: BOOTSTRAP_USER_ID,
      email: "bootstrap@excalidash.local",
      name: "Bootstrap Admin",
      role: "ADMIN",
      isActive: false,
      mustResetPassword: true,
      username: null,
    });

    const service = createAuthModeService(prisma);
    const bootstrapUser = await service.getBootstrapActingUser();

    expect(bootstrapUser.id).toBe(BOOTSTRAP_USER_ID);
    expect(userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOOTSTRAP_USER_ID },
        create: expect.objectContaining({
          id: BOOTSTRAP_USER_ID,
          email: "bootstrap@excalidash.local",
          role: "ADMIN",
        }),
      })
    );
  });

  it("reads an existing system config without writing (no upsert on the read path)", async () => {
    // Regression for issue #182: ensureSystemConfig runs on every
    // /auth/status request; when the row already exists it must NOT take a
    // write lock, or SQLite serialises readers behind the writer and times
    // out under load.
    const prisma = createPrismaMock();
    const findUnique = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;
    const upsert = prisma.systemConfig.upsert as unknown as ReturnType<typeof vi.fn>;
    findUnique.mockResolvedValue({
      id: DEFAULT_SYSTEM_CONFIG_ID,
      authEnabled: true,
      registrationEnabled: false,
    });

    const service = createAuthModeService(prisma);
    const result = await service.ensureSystemConfig();

    expect(result).toMatchObject({ id: DEFAULT_SYSTEM_CONFIG_ID, authEnabled: true });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  describe("AUTH_MODE=disabled", () => {
    let originalAuthMode: typeof config.authMode;

    beforeEach(() => {
      originalAuthMode = config.authMode;
    });

    afterEach(() => {
      (config as { authMode: typeof config.authMode }).authMode = originalAuthMode;
    });

    it("forces authEnabled false without reading the database", async () => {
      (config as { authMode: typeof config.authMode }).authMode = "disabled";
      const prisma = createPrismaMock();
      const findUnique = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;
      const upsert = prisma.systemConfig.upsert as unknown as ReturnType<typeof vi.fn>;

      const service = createAuthModeService(prisma);

      await expect(service.getAuthEnabled()).resolves.toBe(false);
      expect(findUnique).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });

    it("still forces auth on for the OIDC-backed modes", async () => {
      (config as { authMode: typeof config.authMode }).authMode = "hybrid";
      const prisma = createPrismaMock();
      const findUnique = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;

      const service = createAuthModeService(prisma);

      await expect(service.getAuthEnabled()).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  it("authModeEnablesAuth is true only for the OIDC-backed modes", () => {
    expect(authModeEnablesAuth("hybrid")).toBe(true);
    expect(authModeEnablesAuth("oidc_enforced")).toBe(true);
    expect(authModeEnablesAuth("local")).toBe(false);
    expect(authModeEnablesAuth("disabled")).toBe(false);
  });

  it("ensures system config defaults", async () => {
    const prisma = createPrismaMock();
    const upsert = prisma.systemConfig.upsert as unknown as ReturnType<typeof vi.fn>;
    upsert.mockResolvedValue({ authEnabled: false });

    const service = createAuthModeService(prisma);
    await service.ensureSystemConfig();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEFAULT_SYSTEM_CONFIG_ID },
        create: expect.objectContaining({
          id: DEFAULT_SYSTEM_CONFIG_ID,
          authEnabled: false,
          registrationEnabled: false,
        }),
      })
    );
  });
});
