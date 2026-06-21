#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const prismaDir = path.resolve(backendRoot, "prisma");
const migrationsDir = path.resolve(prismaDir, "migrations");
const schemaFile = path.resolve(prismaDir, "schema.prisma");
const localTmpRoot = path.resolve(backendRoot, ".prisma-workspaces.tmp");
const validProviders = new Set(["sqlite", "postgresql"]);

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const inferProvider = (env = process.env) => {
  const configured = String(env.DATABASE_PROVIDER || "").trim();
  if (validProviders.has(configured)) return configured;
  if (configured) {
    throw new Error(
      `DATABASE_PROVIDER must be 'sqlite' or 'postgresql', got '${configured}'`
    );
  }

  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) return "postgresql";
  if (databaseUrl.startsWith("file:") || databaseUrl.length === 0) return "sqlite";

  return "sqlite";
};

const normalizeDatabaseUrl = (rawUrl) => {
  const defaultDbPath = path.resolve(prismaDir, "dev.db");

  if (!rawUrl || String(rawUrl).trim().length === 0) {
    return `file:${defaultDbPath}`;
  }

  const value = String(rawUrl);
  if (!value.startsWith("file:")) return value;

  const filePath = value.replace(/^file:/, "");
  const normalizedRelative = filePath.replace(/^\.\/?/, "");
  const hasLeadingPrismaDir =
    normalizedRelative === "prisma" || normalizedRelative.startsWith("prisma/");

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(hasLeadingPrismaDir ? backendRoot : prismaDir, normalizedRelative);

  return `file:${absolutePath}`;
};

const rewriteSchemaProvider = (schema, provider) => {
  const datasourceProviderPattern =
    /(datasource\s+db\s*{[\s\S]*?provider\s*=\s*)(?:env\("[^"]*"\)|"[^"]*")/;
  if (!datasourceProviderPattern.test(schema)) {
    throw new Error("Could not find datasource provider in prisma/schema.prisma");
  }
  return schema.replace(datasourceProviderPattern, `$1"${provider}"`);
};

const copyDirectoryContents = (fromDir, toDir) => {
  fs.mkdirSync(toDir, { recursive: true });
  if (!fs.existsSync(fromDir)) return;

  for (const entry of fs.readdirSync(fromDir)) {
    const fromPath = path.join(fromDir, entry);
    const toPath = path.join(toDir, entry);
    fs.cpSync(fromPath, toPath, { recursive: true });
  }
};

const getWorkspaceTempRoots = () => {
  const roots = [];
  const addRoot = (root) => {
    if (root && !roots.includes(root)) roots.push(root);
  };

  addRoot(os.tmpdir());
  addRoot(localTmpRoot);

  return roots;
};

const createProviderWorkspaceInRoot = (provider, providerMigrationsDir, tempRoot) => {
  fs.mkdirSync(tempRoot, { recursive: true });

  const workspaceDir = fs.mkdtempSync(path.join(tempRoot, "excalidash-prisma-"));
  const workspaceMigrationsDir = path.join(workspaceDir, "migrations");
  const workspaceSchema = path.join(workspaceDir, "schema.prisma");

  try {
    fs.writeFileSync(
      workspaceSchema,
      rewriteSchemaProvider(fs.readFileSync(schemaFile, "utf8"), provider)
    );
    copyDirectoryContents(providerMigrationsDir, workspaceMigrationsDir);
  } catch (error) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    throw error;
  }

  return {
    dir: workspaceDir,
    tempRoot,
    migrationsDir: workspaceMigrationsDir,
    schema: workspaceSchema,
    providerMigrationsDir,
  };
};

const createProviderWorkspace = (provider) => {
  const providerMigrationsDir = path.join(migrationsDir, provider);
  if (!fs.existsSync(providerMigrationsDir)) {
    throw new Error(`Missing Prisma migrations for provider '${provider}'`);
  }

  let lastError;
  for (const tempRoot of getWorkspaceTempRoots()) {
    try {
      return createProviderWorkspaceInRoot(provider, providerMigrationsDir, tempRoot);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const persistProviderMigrations = (workspace) => {
  const tmpProviderDir = `${workspace.providerMigrationsDir}.tmp-${process.pid}`;
  fs.rmSync(tmpProviderDir, { recursive: true, force: true });
  copyDirectoryContents(workspace.migrationsDir, tmpProviderDir);
  fs.rmSync(workspace.providerMigrationsDir, { recursive: true, force: true });
  fs.renameSync(tmpProviderDir, workspace.providerMigrationsDir);
};

const withSchemaArg = (args, schema) => {
  if (args.some((arg) => arg === "--schema" || arg.startsWith("--schema="))) {
    return args;
  }
  return [...args, "--schema", schema];
};

const runPrisma = (args, options = {}) => {
  const env = {
    ...process.env,
    ...(options.env || {}),
  };
  const provider = inferProvider(env);
  env.DATABASE_PROVIDER = provider;
  env.DATABASE_URL = normalizeDatabaseUrl(env.DATABASE_URL);

  const workspace = createProviderWorkspace(provider);
  try {
    const result = execFileSync(
      npxBin,
      ["prisma", ...withSchemaArg(args, workspace.schema)],
      {
        cwd: backendRoot,
        env,
        stdio: options.stdio || "inherit",
        encoding: options.encoding,
      }
    );

    if (options.persistProviderMigrations) {
      persistProviderMigrations(workspace);
    }

    return result;
  } finally {
    fs.rmSync(workspace.dir, { recursive: true, force: true });
    if (workspace.tempRoot === localTmpRoot) {
      try {
        fs.rmdirSync(localTmpRoot);
      } catch {
        // Another provider-prisma process may still be using the shared local temp root.
      }
    }
  }
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const persistIndex = args.indexOf("--persist-provider-migrations");
  const persistRequested = persistIndex !== -1;
  if (persistRequested) args.splice(persistIndex, 1);

  if (args.length === 0) {
    console.error("Usage: provider-prisma.cjs [--persist-provider-migrations] <prisma args...>");
    process.exit(1);
  }

  runPrisma(args, { persistProviderMigrations: persistRequested });
}

module.exports = {
  inferProvider,
  normalizeDatabaseUrl,
  runPrisma,
  rewriteSchemaProvider,
};
