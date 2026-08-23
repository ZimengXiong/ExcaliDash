/**
 * Small derived-config resolvers built on the typed env loader. Extracted from
 * config.ts to keep that module under the repo line-count limit.
 */
import { readRaw } from "./env";

export interface LinkShareConfig {
  editDefaultTtlMs: number;
  viewDefaultTtlMs: number;
  maxTtlMs: number;
}

export interface UpdateCheckConfig {
  outbound: boolean;
  githubToken: string | null;
}

/** Parse TRUST_PROXY exactly as backend/src/index.ts does today. */
export const parseTrustProxy = (): boolean | number => {
  const raw = (readRaw("TRUST_PROXY") ?? "false").trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  const hops = Number.parseInt(raw, 10);
  return Number.isFinite(hops) && hops > 0 ? hops : false;
};

export const parseDrawingsCacheTtlMs = (): number => {
  const parsed = Number(readRaw("DRAWINGS_CACHE_TTL_MS"));
  if (!Number.isFinite(parsed) || parsed <= 0) return 5_000;
  return parsed;
};

const parseLinkShareTtl = (name: string, defaultMs: number): number => {
  const raw = readRaw(name);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
};

export const resolveLinkShareConfig = (): LinkShareConfig => ({
  editDefaultTtlMs: parseLinkShareTtl(
    "LINK_SHARE_EDIT_DEFAULT_TTL_MS",
    7 * 24 * 60 * 60 * 1000,
  ),
  viewDefaultTtlMs: parseLinkShareTtl(
    "LINK_SHARE_VIEW_DEFAULT_TTL_MS",
    30 * 24 * 60 * 60 * 1000,
  ),
  maxTtlMs: parseLinkShareTtl("LINK_SHARE_MAX_TTL_MS", 90 * 24 * 60 * 60 * 1000),
});

export const resolveUpdateCheckConfig = (): UpdateCheckConfig => {
  const outboundRaw = (readRaw("UPDATE_CHECK_OUTBOUND") ?? "true")
    .trim()
    .toLowerCase();
  const outbound =
    outboundRaw === "true" || outboundRaw === "1" || outboundRaw === "yes";
  const tokenRaw = (readRaw("UPDATE_CHECK_GITHUB_TOKEN") ?? "").trim();
  return {
    outbound,
    githubToken: tokenRaw.length > 0 ? tokenRaw : null,
  };
};
