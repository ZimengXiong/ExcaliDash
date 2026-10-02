import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../generated/client";

const Database = require("better-sqlite3");
const backend = path.resolve(__dirname, "../..");
const migrations = path.join(backend, "prisma/migrations/sqlite");
// Last migration shipped by the 0.6.2 baseline. Keep this boundary fixed so
// main's release checks still exercise an upgrade after dev is merged.
const baseline = "20260822050000_drop_ai_tldraw";

describe("SQLite release upgrade", () => {
  it("preserves existing accounts, scenes, images, history and access across migration and restart", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "excalidash-upgrade-"),
    );
    const databaseUrl = `file:${path.join(directory, "upgrade.db")}`;
    const schema = path.join(directory, "schema.prisma");
    const workspace = path.join(directory, "migrations");
    let db: any;
    let prisma: PrismaClient | undefined;

    const deploy = () =>
      execFileSync(
        process.execPath,
        [
          path.join(backend, "node_modules/prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          schema,
        ],
        {
          cwd: directory,
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: "pipe",
        },
      );

    try {
      fs.copyFileSync(path.join(backend, "prisma/schema.prisma"), schema);
      fs.mkdirSync(workspace);
      fs.copyFileSync(
        path.join(migrations, "migration_lock.toml"),
        path.join(workspace, "migration_lock.toml"),
      );
      const names = fs
        .readdirSync(migrations)
        .filter((name) => /^\d{14}_/.test(name))
        .sort();
      expect(names).toContain(baseline);
      expect(names.some((name) => name > baseline)).toBe(true);
      for (const name of names.filter((name) => name <= baseline)) {
        fs.cpSync(path.join(migrations, name), path.join(workspace, name), {
          recursive: true,
        });
      }
      deploy();

      db = new Database(path.join(directory, "upgrade.db"));
      db.pragma("foreign_keys = ON");
      db.exec(`
        INSERT INTO User (id, email, passwordHash, name, preferences, createdAt, updatedAt)
          VALUES ('owner', 'owner@example.test', 'fixture-hash', 'Owner', '{"language":"en"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
                 ('viewer', 'viewer@example.test', 'fixture-hash', 'Viewer', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO Collection (id, name, userId, createdAt, updatedAt)
          VALUES ('collection', 'Existing collection', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO Drawing (id, name, elements, appState, files, preview, version, userId, collectionId, createdAt, updatedAt)
          VALUES ('drawing', 'Existing drawing', '[{"id":"shape","type":"rectangle"}]', '{"viewBackgroundColor":"#ffffff"}', '{}', '<svg></svg>', 7, 'owner', 'collection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO DrawingSnapshot (id, drawingId, version, elements, appState, files)
          VALUES ('snapshot', 'drawing', 6, '[{"id":"earlier"}]', '{}', '{}');
        INSERT INTO DrawingPermission (id, drawingId, granteeUserId, permission, createdByUserId, createdAt, updatedAt)
          VALUES ('permission', 'drawing', 'viewer', 'view', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO CollectionShare (id, collectionId, granteeUserId, role, createdByUserId, createdAt, updatedAt)
          VALUES ('share', 'collection', 'viewer', 'view', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO Library (id, items, createdAt, updatedAt)
          VALUES ('user_owner', '[{"id":"library-item"}]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO ApiKey (id, userId, name, keyId, tokenHash, prefix, createdAt, updatedAt)
          VALUES ('key', 'owner', 'Existing key', 'key-id', 'fixture-token-hash', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `);
      db.prepare(
        "INSERT INTO DrawingFile (drawingId, fileId, mimeType, sizeBytes, storage, data) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        "drawing",
        "image",
        "image/png",
        4,
        "db",
        Buffer.from([0, 1, 2, 255]),
      );

      const tables = [
        "User",
        "Collection",
        "Drawing",
        "DrawingSnapshot",
        "DrawingPermission",
        "CollectionShare",
        "Library",
        "DrawingFile",
        "ApiKey",
        "SystemConfig",
      ];
      const snapshots = tables.map((table) => {
        const columns = db
          .prepare(`PRAGMA table_info("${table}")`)
          .all()
          .map((column: { name: string }) => `"${column.name}"`)
          .join(", ");
        const query = `SELECT ${columns} FROM "${table}" ORDER BY rowid`;
        return { query, rows: db.prepare(query).all() };
      });

      for (const name of names.filter((name) => name > baseline)) {
        fs.cpSync(path.join(migrations, name), path.join(workspace, name), {
          recursive: true,
        });
      }
      deploy();
      deploy(); // A second container startup must not replay or corrupt migrations.
      for (const snapshot of snapshots) {
        expect(db.prepare(snapshot.query).all()).toEqual(snapshot.rows);
      }
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(db.pragma("integrity_check", { simple: true })).toBe("ok");

      prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      const drawing = await prisma.drawing.findUnique({
        where: { id: "drawing" },
        include: { snapshots: true, permissions: true },
      });
      expect(drawing?.version).toBe(7);
      expect(drawing?.snapshots[0].version).toBe(6);
      expect(drawing?.permissions[0].granteeUserId).toBe("viewer");
      expect(
        (await prisma.apiKey.findUnique({ where: { id: "key" } }))?.drawingId,
      ).toBeNull();
      await prisma.systemConfig.update({
        where: { id: "default" },
        data: { aiProvider: "disabled" },
      });
      await prisma.apiKey.create({
        data: {
          userId: "owner",
          drawingId: "drawing",
          name: "Scoped key",
          keyId: "scoped",
          tokenHash: "scoped-fixture-hash",
          prefix: "test",
        },
      });
    } finally {
      await prisma?.$disconnect();
      db?.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
