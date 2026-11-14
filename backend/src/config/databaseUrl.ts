import path from "path";

/**
 * Resolve DATABASE_URL the way the backend expects it: an empty value falls
 * back to prisma/dev.db, and relative SQLite `file:` paths are made absolute
 * against the backend root. Free of side effects so the Prisma client can use
 * it at load time, before config.ts has run.
 */
export const resolveDatabaseUrl = (rawUrl?: string): string => {
  const backendRoot = path.resolve(__dirname, "../../");
  const defaultDbPath = path.resolve(backendRoot, "prisma/dev.db");

  if (!rawUrl || rawUrl.trim().length === 0) {
    return `file:${defaultDbPath}`;
  }

  if (!rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const filePath = rawUrl.replace(/^file:/, "");
  const prismaDir = path.resolve(backendRoot, "prisma");
  const normalizedRelative = filePath.replace(/^\.\/?/, "");
  const hasLeadingPrismaDir =
    normalizedRelative === "prisma" || normalizedRelative.startsWith("prisma/");

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(
        hasLeadingPrismaDir ? backendRoot : prismaDir,
        normalizedRelative,
      );

  return `file:${absolutePath}`;
};

/** The resolved DATABASE_URL from the environment. */
export const readDatabaseUrl = (): string =>
  resolveDatabaseUrl(process.env.DATABASE_URL);
