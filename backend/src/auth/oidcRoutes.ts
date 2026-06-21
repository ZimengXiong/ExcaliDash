import crypto from "crypto";
import express, { Request, Response } from "express";
import { Prisma, PrismaClient } from "../generated/client";
import { generators, Issuer } from "openid-client";
import { logAuditEvent } from "../utils/audit";
import { hashTokenForStorage } from "./tokenSecurity";

const OIDC_FLOW_COOKIE_NAME = "excalidash-oidc-flow";
const OIDC_PROVIDER_KEY = "oidc";
const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;

type OidcFlowPayload = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

type OidcUser = {
  id: string;
  username: string | null;
  email: string;
  name: string;
  role: string;
  mustResetPassword: boolean;
  isActive: boolean;
};

type RegisterOidcRoutesDeps = {
  router: express.Router;
  prisma: PrismaClient;
  ensureAuthEnabled: (res: Response) => Promise<boolean>;
  ensureSystemConfig: () => Promise<{
    id: string;
    oidcJitProvisioningEnabled: boolean | null;
  }>;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  generateTokens: (
    userId: string,
    email: string,
    options?: {
      impersonatorId?: string;
      authProvider?: "local" | "oidc";
      oidcGroups?: string[];
    },
  ) => { accessToken: string; refreshToken: string };
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) => void;
  getRefreshTokenExpiresAt: () => Date;
  isMissingRefreshTokenTableError: (error: unknown) => boolean;
  config: {
    authMode: "local" | "hybrid" | "oidc_enforced";
    jwtSecret: string;
    enableRefreshTokenRotation: boolean;
    enableAuditLogging: boolean;
    oidc: {
      enabled: boolean;
      enforced: boolean;
      providerName: string;
      issuerUrl: string | null;
      discoveryUrl: string | null;
      clientId: string | null;
      clientSecret: string | null;
      redirectUri: string | null;
      idTokenSignedResponseAlg: string | null;
      tokenEndpointAuthMethod:
        | "none"
        | "client_secret_basic"
        | "client_secret_post"
        | null;
      scopes: string;
      emailClaim: string;
      emailVerifiedClaim: string;
      groupsClaim: string;
      adminGroups: string[];
      requireEmailVerified: boolean;
      jitProvisioning: boolean;
      firstUserAdmin: boolean;
    };
  };
};

const requestUsesHttps = (req: Request): boolean => {
  if (req.secure) return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const raw = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const firstHop = String(raw || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return firstHop === "https";
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const resolveIdTokenSignedResponseAlg = (
  configuredAlg: string | null,
  hasClientSecret: boolean,
  issuerMetadata: { id_token_signing_alg_values_supported?: unknown },
): string => {
  if (configuredAlg) return configuredAlg;

  const advertised = issuerMetadata.id_token_signing_alg_values_supported;
  if (Array.isArray(advertised)) {
    const supported = advertised
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());
    if (supported.length > 0) {
      // Some providers advertise broad support lists where ordering does not match tenant/client
      // runtime signing behavior. Prefer stable asymmetric defaults over provider list order.
      const preferred = [
        "RS256",
        "PS256",
        "ES256",
        "EdDSA",
        "RS384",
        "PS384",
        "ES384",
        "RS512",
        "PS512",
        "ES512",
      ];
      for (const candidate of preferred) {
        if (supported.includes(candidate)) {
          return candidate;
        }
      }

      const firstAsymmetric = supported.find(
        (alg) => !/^HS/i.test(alg) && alg.toLowerCase() !== "none",
      );
      if (firstAsymmetric) return firstAsymmetric;

      const hsSupported = supported.filter((alg) => /^HS/i.test(alg));
      if (hsSupported.length > 0) {
        if (!hasClientSecret) {
          throw new Error(
            "OIDC provider only advertises HS* ID token signing algorithms, but OIDC_CLIENT_SECRET is not configured. " +
              "Fix: set OIDC_CLIENT_SECRET for a confidential client, or configure your provider/client to sign ID tokens with an asymmetric algorithm (for example RS256).",
          );
        }
        const preferredHs = ["HS256", "HS384", "HS512"];
        for (const candidate of preferredHs) {
          if (hsSupported.includes(candidate)) return candidate;
        }
        return hsSupported[0] as string;
      }
    }
  }

  return "RS256";
};

const parseJwtAlgMismatchError = (
  error: unknown,
): { expected: string; got: string } | null => {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(
    /expected\s+([A-Za-z0-9_-]+)\s*,\s*got:\s*([A-Za-z0-9_-]+)/i,
  );
  if (!match) return null;
  return {
    expected: String(match[1]).toUpperCase(),
    got: String(match[2]).toUpperCase(),
  };
};

const canUseIdTokenSigningAlg = (
  alg: string,
  hasClientSecret: boolean,
): boolean => {
  if (alg.toLowerCase() === "none") return false;
  if (/^HS/i.test(alg)) return hasClientSecret;
  return true;
};

const sanitizeReturnTo = (rawValue: unknown): string => {
  if (typeof rawValue !== "string") return "/";
  const value = rawValue.trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (/[\r\n]/.test(value)) return "/";
  if (value.length > 2048) return "/";
  return value;
};

const base64UrlEncode = (value: Buffer | string): string => {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

const signFlowPayload = (encodedPayload: string, secret: string): string =>
  base64UrlEncode(
    crypto.createHmac("sha256", secret).update(encodedPayload, "utf8").digest(),
  );

const encodeFlowPayload = (
  payload: OidcFlowPayload,
  secret: string,
): string => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signFlowPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

const decodeFlowPayload = (
  cookieValue: string | null,
  secret: string,
): OidcFlowPayload | null => {
  if (!cookieValue) return null;
  const [encodedPayload, providedSignature] = cookieValue.split(".");
  if (!encodedPayload || !providedSignature) return null;

  try {
    const expectedSignature = signFlowPayload(encodedPayload, secret);
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(providedSignature, "utf8");
    if (expectedBuffer.length !== providedBuffer.length) return null;
    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return null;

    const parsed = JSON.parse(
      base64UrlDecode(encodedPayload).toString("utf8"),
    ) as Partial<OidcFlowPayload>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    if (Date.now() > parsed.expiresAt) return null;
    return {
      state: parsed.state,
      nonce: parsed.nonce,
      codeVerifier: parsed.codeVerifier,
      returnTo: sanitizeReturnTo(parsed.returnTo),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
};

const readStringClaim = (
  claims: Record<string, unknown>,
  key: string,
): string | null => {
  const value = claims[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readBooleanClaim = (
  claims: Record<string, unknown>,
  key: string,
): boolean | null => {
  const value = claims[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
};

const readClaimByPath = (
  claims: Record<string, unknown>,
  keyPath: string,
): unknown => {
  const segments = keyPath
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return undefined;

  let current: unknown = claims;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const normalizeClaimGroups = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
};

const canonicalizeIssuerUrl = (issuer: string): string => {
  const trimmed = issuer.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const getOidcErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case "missing_flow":
      return "Missing or expired OIDC login flow. Please try again.";
    case "provider_error":
      return "OIDC provider returned an error.";
    case "missing_subject":
      return "OIDC response is missing required subject claim.";
    case "missing_email":
      return "OIDC response is missing required email claim.";
    case "unverified_email":
      return "OIDC account email is not verified.";
    case "account_inactive":
      return "Your account is inactive.";
    case "provisioning_disabled":
      return "No account found. Ask an admin to create your account or enable OIDC auto-provisioning.";
    case "callback_failed":
      return "OIDC callback validation failed.";
    default:
      return "OIDC sign-in failed.";
  }
};

export const registerOidcRoutes = (deps: RegisterOidcRoutesDeps) => {
  const {
    router,
    prisma,
    ensureAuthEnabled,
    ensureSystemConfig,
    sanitizeText,
    generateTokens,
    setAuthCookies,
    getRefreshTokenExpiresAt,
    isMissingRefreshTokenTableError,
    config,
  } = deps;

  if (!config.oidc.enabled) {
    return;
  }

  let oidcClientPromise: Promise<any> | null = null;

  const selectTokenEndpointAuthMethod = (opts: {
    hasClientSecret: boolean;
    supported?: string[];
    configured: "none" | "client_secret_basic" | "client_secret_post" | null;
  }): string => {
    const supported = opts.supported?.filter(Boolean);
    if (opts.configured) {
      if (
        supported &&
        supported.length > 0 &&
        !supported.includes(opts.configured)
      ) {
        throw new Error(
          `OIDC_TOKEN_ENDPOINT_AUTH_METHOD=${opts.configured} is configured, but provider does not advertise support for it. ` +
            `Supported methods: ${supported.join(", ")}`,
        );
      }
      return opts.configured;
    }

    if (!opts.hasClientSecret) {
      const method = "none";
      if (supported && supported.length > 0 && !supported.includes(method)) {
        throw new Error(
          `OIDC is configured without OIDC_CLIENT_SECRET (public client), but the provider does not advertise support for token endpoint auth method "${method}". ` +
            `Fix: configure the client as public at your IdP (token endpoint auth = none), or set OIDC_CLIENT_SECRET for a confidential client.`,
        );
      }
      return method;
    }

    const preferred = ["client_secret_basic", "client_secret_post"];
    for (const candidate of preferred) {
      if (
        !supported ||
        supported.length === 0 ||
        supported.includes(candidate)
      ) {
        return candidate;
      }
    }

    throw new Error(
      `OIDC provider does not advertise support for client_secret-based token endpoint auth methods (tried: ${preferred.join(", ")}). ` +
        `If your provider requires JWT-based client auth (private_key_jwt/client_secret_jwt), ExcaliDash currently does not expose configuration for that.`,
    );
  };

  const buildOidcClient = async (
    idTokenSignedResponseAlgOverride: string | null = null,
  ) => {
    if (
      !config.oidc.issuerUrl ||
      !config.oidc.clientId ||
      !config.oidc.redirectUri
    ) {
      throw new Error(
        "OIDC is enabled but provider configuration is incomplete",
      );
    }

    const discoveryUrl =
      config.oidc.discoveryUrl || (config.oidc.issuerUrl as string);
    const clientIssuer = await Issuer.discover(discoveryUrl);
    const expectedIssuer = canonicalizeIssuerUrl(
      config.oidc.issuerUrl as string,
    );
    const discoveredIssuerRaw =
      typeof (clientIssuer as any)?.issuer === "string"
        ? ((clientIssuer as any).issuer as string)
        : typeof (clientIssuer as any)?.metadata?.issuer === "string"
          ? ((clientIssuer as any).metadata.issuer as string)
          : null;
    const discoveredIssuer = discoveredIssuerRaw
      ? canonicalizeIssuerUrl(discoveredIssuerRaw)
      : null;

    if (!discoveredIssuer || discoveredIssuer !== expectedIssuer) {
      if (discoveredIssuer && discoveredIssuer !== expectedIssuer) {
        console.warn(
          `[OIDC] Issuer mismatch between discovery (${discoveredIssuerRaw}) and configured OIDC_ISSUER_URL (${config.oidc.issuerUrl}); using configured issuer for token validation.`,
        );
      }

      if (typeof (clientIssuer as any) === "object" && clientIssuer) {
        if (
          typeof (clientIssuer as any).metadata === "object" &&
          (clientIssuer as any).metadata !== null
        ) {
          (clientIssuer as any).metadata.issuer = expectedIssuer;
        } else {
          (clientIssuer as any).metadata = { issuer: expectedIssuer };
        }

        // Some openid-client issuer objects expose `issuer` as a getter-only
        // property; updating metadata keeps token validation issuer in sync.
        const issuerDescriptor = Object.getOwnPropertyDescriptor(
          clientIssuer,
          "issuer",
        );
        if (!issuerDescriptor || issuerDescriptor.writable) {
          (clientIssuer as any).issuer = expectedIssuer;
        }
      }
    }

    const supportedMethods = (clientIssuer as any)?.metadata
      ?.token_endpoint_auth_methods_supported as string[] | undefined;
    const tokenEndpointAuthMethod = selectTokenEndpointAuthMethod({
      hasClientSecret: Boolean(config.oidc.clientSecret),
      supported: supportedMethods,
      configured: config.oidc.tokenEndpointAuthMethod,
    });
    const defaultIdTokenAlg = resolveIdTokenSignedResponseAlg(
      config.oidc.idTokenSignedResponseAlg,
      Boolean(config.oidc.clientSecret),
      (clientIssuer as any)?.metadata ?? {},
    );
    const idTokenSignedResponseAlg =
      idTokenSignedResponseAlgOverride || defaultIdTokenAlg;

    const clientConfig: Record<string, unknown> = {
      client_id: config.oidc.clientId as string,
      redirect_uris: [config.oidc.redirectUri as string],
      response_types: ["code"],
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      id_token_signed_response_alg: idTokenSignedResponseAlg,
    };

    if (config.oidc.clientSecret) {
      clientConfig.client_secret = config.oidc.clientSecret;
    }

    return new clientIssuer.Client(clientConfig as any);
  };

  const getOidcClient = async () => {
    if (!oidcClientPromise) {
      oidcClientPromise = buildOidcClient();
    }

    try {
      return await oidcClientPromise;
    } catch (error) {
      oidcClientPromise = null;
      throw error;
    }
  };

  const clearOidcFlowCookie = (req: Request, res: Response) => {
    res.clearCookie(OIDC_FLOW_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(req),
      path: "/",
    });
  };

  const setOidcFlowCookie = (
    req: Request,
    res: Response,
    payload: OidcFlowPayload,
  ) => {
    const encoded = encodeFlowPayload(payload, config.jwtSecret);
    res.cookie(OIDC_FLOW_COOKIE_NAME, encoded, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(req),
      path: "/",
      maxAge: OIDC_FLOW_TTL_MS,
    });
  };

  const redirectToLoginWithError = (
    req: Request,
    res: Response,
    errorCode: string,
    returnTo?: string,
  ) => {
    const search = new URLSearchParams();
    search.set("oidcError", errorCode);
    search.set("oidcErrorMessage", getOidcErrorMessage(errorCode));
    if (returnTo) {
      search.set("returnTo", sanitizeReturnTo(returnTo));
    }

    clearOidcFlowCookie(req, res);
    return res.redirect(`/login?${search.toString()}`);
  };

  const userSelect = {
    id: true,
    username: true,
    email: true,
    name: true,
    role: true,
    mustResetPassword: true,
    isActive: true,
  } as const;

  const ensureTrashCollection = async (
    tx: Prisma.TransactionClient,
    userId: string,
  ) => {
    const trashCollectionId = `trash:${userId}`;
    const existingTrash = await tx.collection.findFirst({
      where: { id: trashCollectionId, userId },
      select: { id: true },
    });
    if (!existingTrash) {
      await tx.collection.create({
        data: {
          id: trashCollectionId,
          name: "Trash",
          userId,
        },
      });
    }
  };

  router.get("/oidc/start", async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      const client = await getOidcClient();
      const state = generators.state();
      const nonce = generators.nonce();
      const codeVerifier = generators.codeVerifier();
      const codeChallenge = generators.codeChallenge(codeVerifier);
      const returnTo = sanitizeReturnTo(req.query.returnTo);

      setOidcFlowCookie(req, res, {
        state,
        nonce,
        codeVerifier,
        returnTo,
        expiresAt: Date.now() + OIDC_FLOW_TTL_MS,
      });

      const authorizationUrl = client.authorizationUrl({
        scope: config.oidc.scopes,
        response_type: "code",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      return res.redirect(authorizationUrl);
    } catch (error) {
      console.error("OIDC start error:", error);
      return redirectToLoginWithError(req, res, "callback_failed");
    }
  });

  router.get("/oidc/callback", async (req: Request, res: Response) => {
    const cookieValue = (() => {
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) return null;
      for (const part of cookieHeader.split(";")) {
        const [rawKey, ...rawValueParts] = part.split("=");
        if (!rawKey || rawValueParts.length === 0) continue;
        if (rawKey.trim() !== OIDC_FLOW_COOKIE_NAME) continue;
        const rawValue = rawValueParts.join("=").trim();
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
      return null;
    })();
    const flow = decodeFlowPayload(cookieValue, config.jwtSecret);
    clearOidcFlowCookie(req, res);

    if (!flow) {
      return redirectToLoginWithError(req, res, "missing_flow");
    }

    try {
      if (!(await ensureAuthEnabled(res))) return;

      if (typeof req.query.error === "string") {
        return redirectToLoginWithError(
          req,
          res,
          "provider_error",
          flow.returnTo,
        );
      }

      const client = await getOidcClient();
      const params = client.callbackParams(req);
      const checks = {
        state: flow.state,
        nonce: flow.nonce,
        code_verifier: flow.codeVerifier,
      };
      let tokenSet;
      try {
        tokenSet = await client.callback(
          config.oidc.redirectUri as string,
          params,
          checks,
        );
      } catch (error) {
        const mismatch = parseJwtAlgMismatchError(error);
        const hasExplicitAlgOverride = Boolean(
          config.oidc.idTokenSignedResponseAlg,
        );
        const canRetryWithObservedAlg =
          !hasExplicitAlgOverride &&
          mismatch !== null &&
          canUseIdTokenSigningAlg(
            mismatch.got,
            Boolean(config.oidc.clientSecret),
          );

        if (!canRetryWithObservedAlg) {
          throw error;
        }

        console.warn(
          `OIDC callback id_token alg mismatch (expected ${mismatch.expected}, got ${mismatch.got}); retrying once with ${mismatch.got}.`,
        );
        const retryClient = await buildOidcClient(mismatch.got);
        tokenSet = await retryClient.callback(
          config.oidc.redirectUri as string,
          params,
          checks,
        );
      }
      const claims = tokenSet.claims() as Record<string, unknown>;
      const issuer = client.issuer.issuer;
      const subject = readStringClaim(claims, "sub");
      if (!subject) {
        return redirectToLoginWithError(
          req,
          res,
          "missing_subject",
          flow.returnTo,
        );
      }

      const rawEmail =
        readStringClaim(claims, config.oidc.emailClaim) ??
        readStringClaim(claims, "email");
      if (!rawEmail) {
        return redirectToLoginWithError(
          req,
          res,
          "missing_email",
          flow.returnTo,
        );
      }
      const normalizedEmail = normalizeEmail(rawEmail);
      const systemConfig = await ensureSystemConfig();
      const jitProvisioningEnabled =
        typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
          ? systemConfig.oidcJitProvisioningEnabled
          : config.oidc.jitProvisioning;

      const emailVerified = readBooleanClaim(
        claims,
        config.oidc.emailVerifiedClaim,
      );
      if (config.oidc.requireEmailVerified && emailVerified !== true) {
        return redirectToLoginWithError(
          req,
          res,
          "unverified_email",
          flow.returnTo,
        );
      }

      const oidcGroups = Array.from(
        new Set(
          normalizeClaimGroups(
            readClaimByPath(claims, config.oidc.groupsClaim),
          ),
        ),
      );
      const adminGroups = new Set(config.oidc.adminGroups);
      const shouldBeAdmin =
        adminGroups.size > 0 &&
        oidcGroups.some((group) => adminGroups.has(group));

      const user = await prisma.$transaction(async (tx) => {
        const linkedIdentity = await tx.authIdentity.findUnique({
          where: {
            issuer_subject: {
              issuer,
              subject,
            },
          },
          include: {
            user: {
              select: userSelect,
            },
          },
        });
        if (linkedIdentity) {
          await tx.authIdentity.update({
            where: { id: linkedIdentity.id },
            data: {
              lastLoginAt: new Date(),
              emailAtLink: normalizedEmail,
            },
          });
          return linkedIdentity.user;
        }

        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
          select: userSelect,
        });

        if (existingUser && !existingUser.isActive) {
          return existingUser;
        }

        let resolvedUser: OidcUser;
        if (existingUser) {
          resolvedUser = existingUser;
        } else {
          if (!jitProvisioningEnabled) {
            throw new Error("OIDC provisioning disabled");
          }

          const activeUsers = await tx.user.count({
            where: { isActive: true },
          });
          const defaultName =
            readStringClaim(claims, "name") ??
            readStringClaim(claims, "preferred_username") ??
            normalizedEmail.split("@")[0] ??
            "User";
          const sanitizedName = sanitizeText(defaultName, 100) || "User";
          const role =
            activeUsers === 0 && config.oidc.firstUserAdmin ? "ADMIN" : "USER";

          resolvedUser = await tx.user.create({
            data: {
              email: normalizedEmail,
              username: null,
              passwordHash: "",
              name: sanitizedName,
              role,
              mustResetPassword: false,
              isActive: true,
            },
            select: userSelect,
          });

          await ensureTrashCollection(tx, resolvedUser.id);
        }

        const existingProviderIdentity = await tx.authIdentity.findUnique({
          where: {
            provider_userId: {
              provider: OIDC_PROVIDER_KEY,
              userId: resolvedUser.id,
            },
          },
          select: {
            id: true,
            issuer: true,
            subject: true,
          },
        });

        if (existingProviderIdentity) {
          await tx.authIdentity.update({
            where: { id: existingProviderIdentity.id },
            data: {
              issuer,
              subject,
              emailAtLink: normalizedEmail,
              lastLoginAt: new Date(),
            },
          });
        } else {
          await tx.authIdentity.create({
            data: {
              userId: resolvedUser.id,
              provider: OIDC_PROVIDER_KEY,
              issuer,
              subject,
              emailAtLink: normalizedEmail,
              lastLoginAt: new Date(),
            },
          });
        }

        if (adminGroups.size > 0) {
          const nextRole = shouldBeAdmin ? "ADMIN" : "USER";
          if (resolvedUser.role !== nextRole) {
            resolvedUser = await tx.user.update({
              where: { id: resolvedUser.id },
              data: { role: nextRole },
              select: userSelect,
            });
          }
        }

        return resolvedUser;
      });

      if (!user.isActive) {
        return redirectToLoginWithError(
          req,
          res,
          "account_inactive",
          flow.returnTo,
        );
      }

      const { accessToken, refreshToken } = generateTokens(
        user.id,
        user.email,
        {
          authProvider: "oidc",
          oidcGroups,
        },
      );
      setAuthCookies(req, res, { accessToken, refreshToken });

      if (config.enableRefreshTokenRotation) {
        const expiresAt = getRefreshTokenExpiresAt();
        try {
          await prisma.refreshToken.create({
            data: {
              userId: user.id,
              token: hashTokenForStorage(refreshToken),
              expiresAt,
            },
          });
        } catch (error) {
          if (isMissingRefreshTokenTableError(error)) {
            return redirectToLoginWithError(
              req,
              res,
              "callback_failed",
              flow.returnTo,
            );
          }
          throw error;
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: user.id,
          action: "oidc_login",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: {
            provider: config.oidc.providerName,
            issuer,
          },
        });
      }

      return res.redirect(flow.returnTo || "/");
    } catch (error) {
      if (
        error instanceof Error &&
        /OIDC provisioning disabled/i.test(error.message)
      ) {
        return redirectToLoginWithError(
          req,
          res,
          "provisioning_disabled",
          flow.returnTo,
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return redirectToLoginWithError(
          req,
          res,
          "callback_failed",
          flow.returnTo,
        );
      }

      console.error("OIDC callback error:", error);
      return redirectToLoginWithError(
        req,
        res,
        "callback_failed",
        flow.returnTo,
      );
    }
  });
};
