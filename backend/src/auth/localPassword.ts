export const hasLocalPasswordHash = (
  passwordHash: string | null | undefined
): passwordHash is string => typeof passwordHash === "string" && passwordHash.startsWith("$2");

export const canUseLocalPasswordFlows = (user: {
  passwordHash: string | null | undefined;
} | null | undefined): boolean => hasLocalPasswordHash(user?.passwordHash);
