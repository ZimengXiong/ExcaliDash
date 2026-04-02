import type { Request } from "express";

type RequestLike = Pick<Request, "headers" | "secure" | "originalUrl" | "url"> & {
  header?: (name: string) => string | undefined;
  get?: (name: string) => string | undefined;
};

type ParsedAllowedOrigin = {
  host: string;
  protocol: "http:" | "https:";
};

export type HttpsRedirectPolicy = {
  shouldEnforceHttps: boolean;
  canonicalHttpsHost: string | null;
  hostProtocols: Map<string, Set<"http:" | "https:">>;
};

const parseAllowedOrigin = (origin: string): ParsedAllowedOrigin | null => {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return {
      host: parsed.host.toLowerCase(),
      protocol: parsed.protocol,
    };
  } catch {
    return null;
  }
};

const readHeader = (req: RequestLike, name: string): string | null => {
  const normalizedName = name.toLowerCase();
  const directHeader = req.header?.(normalizedName) ?? req.get?.(normalizedName);
  if (typeof directHeader === "string") {
    const trimmed = directHeader.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const rawHeader = req.headers?.[normalizedName];
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getForwardedProto = (req: RequestLike): string | null => {
  const raw = readHeader(req, "x-forwarded-proto");
  if (!raw) return null;
  const firstHop = raw.split(",")[0]?.trim().toLowerCase() || "";
  return firstHop.length > 0 ? firstHop : null;
};

export const createHttpsRedirectPolicy = (
  allowedOrigins: string[]
): HttpsRedirectPolicy => {
  const parsedOrigins = allowedOrigins
    .map((origin) => parseAllowedOrigin(origin))
    .filter((origin): origin is ParsedAllowedOrigin => origin !== null);

  const hostProtocols = new Map<string, Set<"http:" | "https:">>();
  for (const origin of parsedOrigins) {
    const existing = hostProtocols.get(origin.host) ?? new Set<"http:" | "https:">();
    existing.add(origin.protocol);
    hostProtocols.set(origin.host, existing);
  }

  const canonicalHttpsHost =
    parsedOrigins.find((origin) => origin.protocol === "https:")?.host ?? null;

  return {
    shouldEnforceHttps: canonicalHttpsHost !== null,
    canonicalHttpsHost,
    hostProtocols,
  };
};

export const getHttpsRedirectUrl = (
  req: RequestLike,
  policy: HttpsRedirectPolicy
): string | null => {
  if (!policy.shouldEnforceHttps) return null;
  if (req.secure || getForwardedProto(req) === "https") return null;

  const rawHost = readHeader(req, "host")?.toLowerCase() ?? "";
  const protocols = rawHost ? policy.hostProtocols.get(rawHost) : undefined;

  if (protocols?.has("http:")) {
    return null;
  }

  const targetHost = protocols?.has("https:") ? rawHost : policy.canonicalHttpsHost;
  if (!targetHost) return null;

  const path = (req.originalUrl || req.url || "/").startsWith("/")
    ? (req.originalUrl || req.url || "/")
    : "/";
  return `https://${targetHost}${path}`;
};
