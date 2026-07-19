import type { Response } from "express";

export const AI_FEATURES_DISABLED_CODE = "AI_FEATURES_DISABLED";

export const AI_FEATURES_DISABLED_RESPONSE = {
  error: "AI features disabled",
  code: AI_FEATURES_DISABLED_CODE,
  message: "AI features are disabled by an administrator.",
} as const;

type SystemConfigReader = {
  systemConfig: {
    findUnique: (args: {
      where: { id: string };
      select: { aiEnabled: true };
    }) => Promise<{ aiEnabled: boolean } | null>;
  };
};

export const isAiEnabled = (row?: { aiEnabled?: boolean | null } | null): boolean =>
  row?.aiEnabled ?? true;

export const loadAiEnabled = async (
  prisma: SystemConfigReader,
  systemConfigId = "default",
): Promise<boolean> => {
  const row = await prisma.systemConfig.findUnique({
    where: { id: systemConfigId },
    select: { aiEnabled: true },
  });
  return isAiEnabled(row);
};

export const ensureAiEnabled = async (
  prisma: SystemConfigReader,
  res: Response,
  systemConfigId = "default",
): Promise<boolean> => {
  if (await loadAiEnabled(prisma, systemConfigId)) return true;
  res.status(403).json(AI_FEATURES_DISABLED_RESPONSE);
  return false;
};
