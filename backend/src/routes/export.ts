/**
 * Export/Import API routes
 * Extracted from index.ts to reduce god file
 */
import { Router } from "express";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import archiver from "archiver";
import { Worker } from "worker_threads";
import multer from "multer";
import { PrismaClient } from "../generated/client";
import { invalidateDrawingsCache } from "../utils/cache";

interface ExportRouterOptions {
  prisma: PrismaClient;
  uploadDir: string;
  getResolvedDbPath: () => string;
}

const validateSqliteHeader = (filePath: string): boolean => {
  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 16) {
      console.warn("File too small to be a valid SQLite database");
      return false;
    }

    const expectedHeader = Buffer.from([
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
      0x74, 0x20, 0x33, 0x00,
    ]);

    const isValid = buffer.equals(expectedHeader);
    if (!isValid) {
      console.warn("Invalid SQLite file header detected", {
        filePath,
        header: buffer.toString("hex"),
        expected: expectedHeader.toString("hex"),
      });
    }

    return isValid;
  } catch (error) {
    console.error("Failed to validate SQLite header:", error);
    return false;
  }
};

const verifyDatabaseIntegrityAsync = (filePath: string): Promise<boolean> => {
  if (!validateSqliteHeader(filePath)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const worker = new Worker(
      path.resolve(__dirname, "../workers/db-verify.js"),
      {
        workerData: { filePath },
      }
    );
    let timeoutHandle: NodeJS.Timeout;
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    };

    worker.on("message", (isValid: boolean) => finish(isValid));
    worker.on("error", (err) => {
      console.error("Worker error:", err);
      finish(false);
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        finish(false);
      }
    });

    timeoutHandle = setTimeout(() => {
      console.warn("Integrity check worker timed out", { filePath });
      worker.terminate();
      finish(false);
    }, 10000);
  });
};

const removeFileIfExists = async (filePath?: string) => {
  if (!filePath) return;
  try {
    await fsPromises.access(filePath).catch(() => {
      return;
    });
    await fsPromises.unlink(filePath);
  } catch (error) {
    console.error("Failed to remove file", { filePath, error });
  }
};

const moveFile = async (source: string, destination: string) => {
  try {
    await fsPromises.rename(source, destination);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (!err || err.code !== "EXDEV") {
      throw error;
    }

    await fsPromises
      .unlink(destination)
      .catch((unlinkError: NodeJS.ErrnoException) => {
        if (unlinkError && unlinkError.code !== "ENOENT") {
          throw unlinkError;
        }
      });

    await fsPromises.copyFile(source, destination);
    await fsPromises.unlink(source);
  }
};

export const createExportRouter = ({
  prisma,
  uploadDir,
  getResolvedDbPath,
}: ExportRouterOptions) => {
  const router = Router();

  const upload = multer({
    dest: uploadDir,
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      if (file.fieldname === "db") {
        const isSqliteDb =
          file.originalname.endsWith(".db") ||
          file.originalname.endsWith(".sqlite");
        if (!isSqliteDb) {
          return cb(new Error("Only .db or .sqlite files are allowed"));
        }
      }
      cb(null, true);
    },
  });

  // GET /export - Export database as SQLite file
  router.get("/", async (req, res) => {
    try {
      const formatParam =
        typeof req.query.format === "string"
          ? req.query.format.toLowerCase()
          : undefined;
      const extension = formatParam === "db" ? "db" : "sqlite";
      const dbPath = getResolvedDbPath();

      try {
        await fsPromises.access(dbPath);
      } catch {
        return res.status(404).json({ error: "Database file not found" });
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="excalidash-db-${new Date().toISOString().split("T")[0]
        }.${extension}"`
      );

      const fileStream = fs.createReadStream(dbPath);
      fileStream.pipe(res);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to export database" });
    }
  });

  // GET /export/json - Export all drawings as ZIP
  router.get("/json", async (_req, res) => {
    try {
      const drawings = await prisma.drawing.findMany({
        include: {
          collection: true,
        },
      });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="excalidraw-drawings-${new Date().toISOString().split("T")[0]
        }.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (err) => {
        console.error("Archive error:", err);
        res.status(500).json({ error: "Failed to create archive" });
      });

      archive.pipe(res);

      const drawingsByCollection: { [key: string]: any[] } = {};

      drawings.forEach((drawing: any) => {
        const collectionName = drawing.collection?.name || "Unorganized";
        if (!drawingsByCollection[collectionName]) {
          drawingsByCollection[collectionName] = [];
        }

        const drawingData = {
          elements: JSON.parse(drawing.elements),
          appState: JSON.parse(drawing.appState),
          files: JSON.parse(drawing.files || "{}"),
        };

        drawingsByCollection[collectionName].push({
          name: drawing.name,
          data: drawingData,
        });
      });

      Object.entries(drawingsByCollection).forEach(
        ([collectionName, collectionDrawings]) => {
          const folderName = collectionName.replace(/[<>:"/\\|?*]/g, "_");
          collectionDrawings.forEach((drawing) => {
            const fileName = `${drawing.name.replace(
              /[<>:"/\\|?*]/g,
              "_"
            )}.excalidraw`;
            const filePath = `${folderName}/${fileName}`;

            archive.append(JSON.stringify(drawing.data, null, 2), {
              name: filePath,
            });
          });
        }
      );

      const readmeContent = `ExcaliDash Export

This archive contains your ExcaliDash drawings organized by collection folders.

Structure:
- Each collection has its own folder
- Each drawing is saved as a .excalidraw file
- Files can be imported back into ExcaliDash

Export Date: ${new Date().toISOString()}
Total Collections: ${Object.keys(drawingsByCollection).length}
Total Drawings: ${drawings.length}

Collections:
${Object.entries(drawingsByCollection)
        .map(([name, drawings]) => `- ${name}: ${drawings.length} drawings`)
        .join("\n")}
`;

      archive.append(readmeContent, { name: "README.txt" });

      await archive.finalize();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to export drawings" });
    }
  });

  // POST /sqlite/verify - Verify uploaded SQLite database (mounted at /import)
  router.post("/sqlite/verify", upload.single("db"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const stagedPath = req.file.path;
      const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
      await removeFileIfExists(stagedPath);

      if (!isValid) {
        return res.status(400).json({ error: "Invalid database format" });
      }

      res.json({ valid: true, message: "Database file is valid" });
    } catch (error) {
      console.error(error);
      if (req.file) {
        await removeFileIfExists(req.file.path);
      }
      res.status(500).json({ error: "Failed to verify database file" });
    }
  });

  // POST /sqlite - Import SQLite database (mounted at /import)
  router.post("/sqlite", upload.single("db"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const originalPath = req.file.path;
      const stagedPath = path.join(
        uploadDir,
        `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
      );

      try {
        await moveFile(originalPath, stagedPath);
      } catch (error) {
        console.error("Failed to stage uploaded database", error);
        await removeFileIfExists(originalPath);
        await removeFileIfExists(stagedPath);
        return res.status(500).json({ error: "Failed to stage uploaded file" });
      }

      const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
      if (!isValid) {
        await removeFileIfExists(stagedPath);
        return res
          .status(400)
          .json({ error: "Uploaded database failed integrity check" });
      }

      const dbPath = getResolvedDbPath();
      const backupPath = `${dbPath}.backup`;

      try {
        try {
          await fsPromises.access(dbPath);
          await fsPromises.copyFile(dbPath, backupPath);
        } catch { }

        await moveFile(stagedPath, dbPath);
      } catch (error) {
        console.error("Failed to replace database", error);
        await removeFileIfExists(stagedPath);
        return res.status(500).json({ error: "Failed to replace database" });
      }

      await prisma.$disconnect();
      invalidateDrawingsCache();

      res.json({ success: true, message: "Database imported successfully" });
    } catch (error) {
      console.error(error);
      if (req.file) {
        await removeFileIfExists(req.file.path);
      }
      res.status(500).json({ error: "Failed to import database" });
    }
  });

  return router;
};
