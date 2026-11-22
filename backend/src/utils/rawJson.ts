import type express from "express";

/**
 * Validate stored JSON before embedding it in a response. Keeping the original
 * text after validation avoids serializing the parsed scene a second time.
 */
const validatedJson = (
  raw: string | null | undefined,
  fallback: "[]" | "{}",
): string => {
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    const valid =
      fallback === "[]"
        ? Array.isArray(value)
        : value !== null && typeof value === "object" && !Array.isArray(value);
    return valid ? raw : fallback;
  } catch {
    return fallback;
  }
};

export const rawJsonArray = (raw: string | null | undefined): string =>
  validatedJson(raw, "[]");

export const rawJsonObject = (raw: string | null | undefined): string =>
  validatedJson(raw, "{}");

/**
 * Send `base` as JSON with `rawFields` (already-serialized JSON text) appended
 * as extra top-level properties. Keys in `rawFields` must not also be in
 * `base`.
 */
export const sendJsonWithRawFields = (
  res: express.Response,
  base: Record<string, unknown>,
  rawFields: Record<string, string>,
): void => {
  const head = JSON.stringify(base);
  const parts: string[] = [head.slice(0, -1)];
  let first = head === "{}";
  for (const [key, value] of Object.entries(rawFields)) {
    parts.push(`${first ? "" : ","}${JSON.stringify(key)}:${value}`);
    first = false;
  }
  parts.push("}");
  res.type("application/json").send(parts.join(""));
};

/**
 * RFC 7240 `Prefer: return=minimal`: the editor's autosave only needs the new
 * version, so it opts out of echoing the whole scene back.
 */
export const prefersMinimalReturn = (req: express.Request): boolean =>
  /(?:^|[,;\s])return=minimal(?:$|[,;\s])/i.test(
    String(req.headers.prefer ?? ""),
  );
