import { randomBytes, randomUUID } from "crypto";
import { Prisma, PrismaClient } from "../generated/client";

export const SHARE_ROLES = ["viewer", "editor"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];
export type DrawingAccessRole = "owner" | ShareRole;

const SHARE_ROLE_SET = new Set<string>(SHARE_ROLES);

export const isShareRole = (value: unknown): value is ShareRole =>
  typeof value === "string" && SHARE_ROLE_SET.has(value);

const roleRank = (role: DrawingAccessRole): number => {
  if (role === "owner") return 3;
  if (role === "editor") return 2;
  return 1;
};

export const isAtLeastRole = (
  grantedRole: DrawingAccessRole,
  requiredRole: DrawingAccessRole
): boolean => roleRank(grantedRole) >= roleRank(requiredRole);

export const generateShareToken = (): string => randomBytes(24).toString("hex");

export type DrawingAccessResult = {
  drawing: {
    id: string;
    userId: string;
    name: string;
    elements: string;
    appState: string;
    files: string;
    preview: string | null;
    version: number;
    collectionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  role: DrawingAccessRole;
  tokenRedeemedRole?: ShareRole;
};

type ResolveDrawingAccessParams = {
  prisma: PrismaClient;
  drawingId: string;
  userId: string;
  shareToken?: string;
};

type RawShareLink = {
  id: string;
  drawingId: string;
  role: string;
};

type RawShareGrant = {
  role: string;
};

const upsertShareGrant = async (
  prisma: PrismaClient,
  params: {
    drawingId: string;
    userId: string;
    shareLinkId: string;
    role: ShareRole;
  }
): Promise<void> => {
  const now = new Date().toISOString();
  await prisma.$executeRaw`
    INSERT OR IGNORE INTO "DrawingShareGrant"
      ("id", "drawingId", "userId", "shareLinkId", "role", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${params.drawingId}, ${params.userId}, ${params.shareLinkId}, ${params.role}, ${now}, ${now})
  `;

  await prisma.$executeRaw`
    UPDATE "DrawingShareGrant"
    SET "role" = ${params.role}, "updatedAt" = ${now}
    WHERE "drawingId" = ${params.drawingId}
      AND "userId" = ${params.userId}
      AND "shareLinkId" = ${params.shareLinkId}
  `;
};

export const resolveDrawingAccess = async ({
  prisma,
  drawingId,
  userId,
  shareToken,
}: ResolveDrawingAccessParams): Promise<DrawingAccessResult | null> => {
  const drawing = await prisma.drawing.findUnique({
    where: { id: drawingId },
  });
  if (!drawing) return null;

  if (drawing.userId === userId) {
    return { drawing, role: "owner" };
  }

  let tokenRedeemedRole: ShareRole | undefined;
  const token = typeof shareToken === "string" && shareToken.trim().length > 0
    ? shareToken.trim()
    : undefined;

  if (token) {
    const links = await prisma.$queryRaw<RawShareLink[]>`
      SELECT "id", "drawingId", "role"
      FROM "DrawingShareLink"
      WHERE "token" = ${token}
      LIMIT 1
    `;
    const link = links[0];

    if (link && link.drawingId === drawingId && isShareRole(link.role)) {
      await upsertShareGrant(prisma, {
        drawingId,
        userId,
        shareLinkId: link.id,
        role: link.role,
      });
      tokenRedeemedRole = link.role;
    }
  }

  const grants = await prisma.$queryRaw<RawShareGrant[]>`
    SELECT "role"
    FROM "DrawingShareGrant"
    WHERE "drawingId" = ${drawingId}
      AND "userId" = ${userId}
  `;

  const hasEditor = grants.some((grant) => grant.role === "editor");
  if (hasEditor) return { drawing, role: "editor", tokenRedeemedRole };

  const hasViewer = grants.some((grant) => grant.role === "viewer");
  if (hasViewer) return { drawing, role: "viewer", tokenRedeemedRole };

  return null;
};

export const ensureShareLinkForRole = async (
  prisma: PrismaClient,
  drawingId: string,
  role: ShareRole
): Promise<{ id: string; token: string }> => {
  const rows = await prisma.$queryRaw<Array<{ id: string; token: string }>>`
    SELECT "id", "token"
    FROM "DrawingShareLink"
    WHERE "drawingId" = ${drawingId}
      AND "role" = ${role}
    LIMIT 1
  `;
  const existing = rows[0];
  if (existing) return existing;

  const token = generateShareToken();
  const now = new Date().toISOString();
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "DrawingShareLink"
      ("id", "drawingId", "role", "token", "createdAt", "updatedAt")
    VALUES
      (${id}, ${drawingId}, ${role}, ${token}, ${now}, ${now})
  `;

  return { id, token };
};

export const rotateShareLinkForRole = async (
  prisma: PrismaClient,
  drawingId: string,
  role: ShareRole
): Promise<{ token: string }> => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "DrawingShareLink"
      WHERE "drawingId" = ${drawingId}
        AND "role" = ${role}
      LIMIT 1
    `;

    const now = new Date().toISOString();
    const token = generateShareToken();

    if (!existing[0]) {
      await tx.$executeRaw`
        INSERT INTO "DrawingShareLink"
          ("id", "drawingId", "role", "token", "createdAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${drawingId}, ${role}, ${token}, ${now}, ${now})
      `;
      return { token };
    }

    const linkId = existing[0].id;

    await tx.$executeRaw`
      DELETE FROM "DrawingShareGrant"
      WHERE "drawingId" = ${drawingId}
        AND "shareLinkId" = ${linkId}
    `;

    await tx.$executeRaw`
      UPDATE "DrawingShareLink"
      SET "token" = ${token}, "updatedAt" = ${now}
      WHERE "id" = ${linkId}
    `;

    return { token };
  });
};

export const getSharedRoleMap = async (
  prisma: PrismaClient,
  userId: string,
  drawingIds: string[]
): Promise<Map<string, ShareRole>> => {
  const roleByDrawingId = new Map<string, ShareRole>();
  if (drawingIds.length === 0) return roleByDrawingId;

  const idsSql = Prisma.join(drawingIds);
  const rows = await prisma.$queryRaw<Array<{ drawingId: string; role: string }>>(
    Prisma.sql`
      SELECT "drawingId", "role"
      FROM "DrawingShareGrant"
      WHERE "userId" = ${userId}
        AND "drawingId" IN (${idsSql})
    `
  );

  for (const row of rows) {
    if (!isShareRole(row.role)) continue;
    const current = roleByDrawingId.get(row.drawingId);
    if (!current || (current === "viewer" && row.role === "editor")) {
      roleByDrawingId.set(row.drawingId, row.role);
    }
  }

  return roleByDrawingId;
};
