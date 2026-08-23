import express from "express";
import { compareSemver, parseSemver } from "../../utils/semver";
import { config } from "../../config";
import type { SystemRouteDeps } from "./index";

type UpdateChannel = "stable" | "prerelease";

type GithubRelease = {
  tag_name?: string;
  html_url?: string;
  prerelease?: boolean;
  draft?: boolean;
  published_at?: string;
};

type UpdateResponse = {
  currentVersion: string | null;
  channel: UpdateChannel;
  outboundEnabled: boolean;
  latestVersion: string | null;
  latestUrl: string | null;
  publishedAt: string | null;
  isUpdateAvailable: boolean | null;
  error?: string;
};

let UPDATE_CHECK_TTL_MS = 10 * 60 * 1000;

let cache:
  | {
      channel: UpdateChannel;
      fetchedAt: number;
      etag: string | null;
      response: Omit<UpdateResponse, "currentVersion">;
    }
  | null = null;

const parseChannel = (raw: unknown): UpdateChannel => {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return normalized === "prerelease" ? "prerelease" : "stable";
};

const envOutboundEnabled = (): boolean => config.updateCheck.outbound;

const envGithubToken = (): string | null => config.updateCheck.githubToken;

const pickLatestRelease = (
  releases: GithubRelease[],
  channel: UpdateChannel
): GithubRelease | null => {
  const candidates = releases
    .filter((r) => r && !r.draft)
    .filter((r) => {
      if (channel === "prerelease") return true;
      if (r.prerelease) return false;
      const tag = typeof r.tag_name === "string" ? r.tag_name : "";
      const parsed = parseSemver(tag);
      return Boolean(parsed && parsed.prerelease.length === 0);
    })
    .map((r) => {
      const tag = typeof r.tag_name === "string" ? r.tag_name : "";
      const parsed = parseSemver(tag);
      return { r, parsed };
    })
    .filter((x) => Boolean(x.parsed)) as Array<{ r: GithubRelease; parsed: NonNullable<ReturnType<typeof parseSemver>> }>;

  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (compareSemver(candidate.parsed, best.parsed) > 0) {
      best = candidate;
    }
  }
  return best.r;
};

const normalizeVersion = (raw: string): string | null => {
  const parsed = parseSemver(raw);
  if (!parsed) return null;
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.prerelease.length > 0 ? `${base}-${parsed.prerelease.join(".")}` : base;
};

export const fetchLatest = async (
  channel: UpdateChannel
): Promise<Omit<UpdateResponse, "currentVersion">> => {
  const now = Date.now();
  if (cache && cache.channel === channel && now - cache.fetchedAt < UPDATE_CHECK_TTL_MS) {
    return cache.response;
  }

  if (!envOutboundEnabled()) {
    const response: Omit<UpdateResponse, "currentVersion"> = {
      channel,
      outboundEnabled: false,
      latestVersion: null,
      latestUrl: null,
      publishedAt: null,
      isUpdateAvailable: null,
    };
    cache = { channel, fetchedAt: now, etag: null, response };
    return response;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ExcaliDash-UpdateCheck",
  };
  const token = envGithubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (cache && cache.channel === channel && cache.etag) {
    headers["If-None-Match"] = cache.etag;
  }

  const url = "https://api.github.com/repos/ZimengXiong/ExcaliDash/releases?per_page=30";
  const resp = await fetch(url, { headers });

  if (resp.status === 304 && cache && cache.channel === channel) {
    cache = { ...cache, fetchedAt: now };
    return cache.response;
  }

  if (!resp.ok) {
    const response: Omit<UpdateResponse, "currentVersion"> = {
      channel,
      outboundEnabled: true,
      latestVersion: null,
      latestUrl: null,
      publishedAt: null,
      isUpdateAvailable: null,
      error: `GitHub API error: HTTP ${resp.status}`,
    };
    cache = { channel, fetchedAt: now, etag: null, response };
    return response;
  }

  const etag = resp.headers.get("etag");
  const json = (await resp.json()) as unknown;
  const releases = Array.isArray(json) ? (json as GithubRelease[]) : [];
  const latest = pickLatestRelease(releases, channel);

  const latestVersion = latest?.tag_name ? normalizeVersion(latest.tag_name) : null;
  const response: Omit<UpdateResponse, "currentVersion"> = {
    channel,
    outboundEnabled: true,
    latestVersion,
    latestUrl: typeof latest?.html_url === "string" ? latest.html_url : null,
    publishedAt: typeof latest?.published_at === "string" ? latest.published_at : null,
    isUpdateAvailable: null, // computed once we know currentVersion
  };

  cache = { channel, fetchedAt: now, etag, response };
  return response;
};

export const computeIsUpdateAvailable = (
  currentVersion: string | null,
  latestVersion: string | null
): boolean | null => {
  if (!currentVersion || !latestVersion) return null;
  const currentParsed = parseSemver(currentVersion);
  const latestParsed = parseSemver(latestVersion);
  if (!currentParsed || !latestParsed) return null;
  return compareSemver(latestParsed, currentParsed) > 0;
};

export const __resetUpdateCacheForTests = (): void => {
  cache = null;
};

export const __setUpdateTtlForTests = (ttlMs: number): void => {
  UPDATE_CHECK_TTL_MS = ttlMs;
};

export const registerUpdateRoutes = (app: express.Express, deps: SystemRouteDeps) => {
  app.get(
    "/system/update",
    deps.asyncHandler(async (req, res) => {
      const channel = parseChannel(req.query.channel);
      const currentVersion = deps.getBackendVersion() || null;

      const latest = await fetchLatest(channel);

      const isUpdateAvailable = computeIsUpdateAvailable(currentVersion, latest.latestVersion);

      const payload: UpdateResponse = {
        ...latest,
        currentVersion,
        isUpdateAvailable,
      };

      res.status(200).json(payload);
    })
  );
};
