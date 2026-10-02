import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reviewRoot = resolve(docsRoot, "../artifacts/docs-review");
const apiRoot = "/__docs-review";
const hash = (text) => createHash("sha256").update(text).digest("hex");

export function docsReviewPlugin(options = {}) {
  const root = options.docsRoot || docsRoot;
  const storage = options.reviewRoot || reviewRoot;
  const queues = new Map();

  async function pages(directory = root, prefix = "") {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "public") continue;
      const file = prefix + entry.name;
      if (entry.isDirectory()) {
        result.push(...(await pages(join(directory, entry.name), `${file}/`)));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const source = await readFile(join(root, file), "utf8");
        const title = source.match(/^# (.+)$/m)?.[1] || "Home";
        const route =
          file === "index.md"
            ? "/"
            : `/${file.replace(/index\.md$|\.md$/g, "")}`;
        result.push({ file, route, title });
      }
    }
    return result.sort((a, b) => a.file.localeCompare(b.file));
  }

  const draftPath = (file) => join(storage, `${hash(file)}.json`);
  async function stored(file) {
    try {
      return JSON.parse(await readFile(draftPath(file), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function load(page) {
    const source = await readFile(join(root, page.file), "utf8");
    const draft = await stored(page.file);
    return {
      ...page,
      source,
      sourceHash: hash(source),
      draft: draft || {
        file: page.file,
        markdown: source,
        notes: "",
        annotations: [],
        baseSource: source,
        baseSourceHash: hash(source),
        revision: 0,
        updatedAt: null,
      },
    };
  }

  async function body(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 512 * 1024)
        throw Object.assign(new Error("Draft exceeds 512 KB."), {
          status: 413,
        });
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw Object.assign(new Error("Invalid JSON."), { status: 400 });
    }
  }

  function validate(input) {
    if (
      !input ||
      typeof input.markdown !== "string" ||
      typeof input.notes !== "string" ||
      typeof input.baseSource !== "string" ||
      typeof input.baseSourceHash !== "string" ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0 ||
      !Array.isArray(input.annotations) ||
      input.annotations.length > 200 ||
      input.annotations.some(
        (item) =>
          !item ||
          typeof item.id !== "string" ||
          typeof item.quote !== "string" ||
          typeof item.comment !== "string" ||
          typeof item.resolved !== "boolean",
      )
    ) {
      throw Object.assign(new Error("Invalid draft."), { status: 400 });
    }
  }

  const send = (response, status, data) => {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(data));
  };

  return {
    name: "excalidash-docs-review",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (!url.pathname.startsWith(apiRoot)) return next();
        try {
          const inventory = await pages();
          if (request.method === "GET" && url.pathname === `${apiRoot}/pages`) {
            return send(response, 200, { pages: inventory });
          }
          if (
            request.method === "GET" &&
            url.pathname === `${apiRoot}/export`
          ) {
            const drafts = await Promise.all(
              inventory.map((page) => load(page)),
            );
            response.setHeader(
              "Content-Disposition",
              'attachment; filename="excalidash-docs-reviews.json"',
            );
            return send(response, 200, {
              exportedAt: new Date().toISOString(),
              pages: drafts,
            });
          }
          if (url.pathname !== `${apiRoot}/page`)
            return send(response, 404, { error: "Not found." });
          const page = inventory.find(
            (item) => item.file === url.searchParams.get("file"),
          );
          if (!page) return send(response, 404, { error: "Page not found." });
          if (request.method === "GET")
            return send(response, 200, await load(page));
          if (request.method !== "PUT")
            return send(response, 405, { error: "Method not allowed." });
          // The private tunnel controls access. Reject cross-origin form/API writes.
          if (
            !request.headers["content-type"]?.startsWith("application/json") ||
            request.headers["x-docs-review"] !== "1"
          ) {
            return send(response, 403, {
              error: "Use the review editor to save drafts.",
            });
          }
          const input = await body(request);
          validate(input);
          const save = (queues.get(page.file) || Promise.resolve())
            .catch(() => {})
            .then(async () => {
              const current = await stored(page.file);
              if ((current?.revision || 0) !== input.revision) {
                return send(response, 409, {
                  error:
                    "This draft changed in another tab. Your edits are kept locally.",
                  draft: current,
                });
              }
              const draft = {
                file: page.file,
                markdown: input.markdown,
                notes: input.notes,
                annotations: input.annotations.map(
                  ({ id, quote, comment, resolved }) => ({
                    id,
                    quote,
                    comment,
                    resolved,
                  }),
                ),
                baseSource: input.baseSource,
                baseSourceHash: input.baseSourceHash,
                revision: input.revision + 1,
                updatedAt: new Date().toISOString(),
              };
              await mkdir(storage, { recursive: true });
              const temp = `${draftPath(page.file)}.${randomUUID()}.tmp`;
              await writeFile(temp, JSON.stringify(draft, null, 2) + "\n", {
                mode: 0o600,
              });
              await rename(temp, draftPath(page.file));
              send(response, 200, {
                revision: draft.revision,
                updatedAt: draft.updatedAt,
              });
            });
          queues.set(page.file, save);
          await save;
          if (queues.get(page.file) === save) queues.delete(page.file);
        } catch (error) {
          console.error("[docs review]", error.message);
          if (!response.headersSent)
            send(response, error.status || 500, {
              error: error.status
                ? error.message
                : "Couldn't save the draft. Retry to save.",
            });
        }
      });
    },
  };
}
