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
    options?: { impersonatorId?: string }
  ) => { accessToken: string; refreshToken: string };
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string }
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
      clientId: string | null;
      clientSecret: string | null;
      redirectUri: string | null;
      idTokenSignedResponseAlg: string;
      scopes: string;
      emailClaim: string;
      emailVerifiedClaim: string;
      requireEmailVerified: boolean;
      jitProvisioning: boolean;
      firstUserAdmin: boolean;
    };
  };
};

const requestUsesHttps = (req: Request): boolean => {
  if (req.secure) return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const raw = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const firstHop = String(raw || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return firstHop === "https";
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

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
    crypto.createHmac("sha256", secret).update(encodedPayload, "utf8").digest()
  );

const encodeFlowPayload = (payload: OidcFlowPayload, secret: string): string => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signFlowPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

const decodeFlowPayload = (
  cookieValue: string | null,
  secret: string
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

    const parsed = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as Partial<OidcFlowPayload>;
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

const readStringClaim = (claims: Record<string, unknown>, key: string): string | null => {
  const value = claims[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readBooleanClaim = (claims: Record<string, unknown>, key: string): boolean | null => {
  const value = claims[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
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
  }): string => {
    const supported = opts.supported?.filter(Boolean);

    if (!opts.hasClientSecret) {
      const method = "none";
      if (supported && supported.length > 0 && !supported.includes(method)) {
        throw new Error(
          `OIDC is configured without OIDC_CLIENT_SECRET (public client), but the provider does not advertise support for token endpoint auth method "${method}". ` +
            `Fix: configure the client as public at your IdP (token endpoint auth = none), or set OIDC_CLIENT_SECRET for a confidential client.`
        );
      }
      return method;
    }

    const preferred = ["client_secret_basic", "client_secret_post"];
    for (const candidate of preferred) {
      if (!supported || supported.length === 0 || supported.includes(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `OIDC provider does not advertise support for client_secret-based token endpoint auth methods (tried: ${preferred.join(", ")}). ` +
        `If your provider requires JWT-based client auth (private_key_jwt/client_secret_jwt), ExcaliDash currently does not expose configuration for that.`
    );
  };

  const getOidcClient = async () => {
    if (!config.oidc.issuerUrl || !config.oidc.clientId || !config.oidc.redirectUri) {
      throw new Error("OIDC is enabled but provider configuration is incomplete");
    }
    if (!oidcClientPromise) {
      oidcClientPromise = (async () => {
        const issuer = await Issuer.discover(config.oidc.issuerUrl as string);
        const supportedMethods = (issuer as any)?.metadata?.token_endpoint_auth_methods_supported as
          | string[]
          | undefined;
        const tokenEndpointAuthMethod = selectTokenEndpointAuthMethod({
          hasClientSecret: Boolean(config.oidc.clientSecret),
          supported: supportedMethods,
        });

        const clientConfig: Record<string, unknown> = {
          client_id: config.oidc.clientId as string,
          redirect_uris: [config.oidc.redirectUri as string],
          response_types: ["code"],
          token_endpoint_auth_method: tokenEndpointAuthMethod,
          id_token_signed_response_alg: config.oidc.idTokenSignedResponseAlg,
        };

        if (config.oidc.clientSecret) {
          clientConfig.client_secret = config.oidc.clientSecret;
        }

        return new issuer.Client(clientConfig as any);
      })();
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

  const setOidcFlowCookie = (req: Request, res: Response, payload: OidcFlowPayload) => {
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
    returnTo?: string
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
    userId: string
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
        return redirectToLoginWithError(req, res, "provider_error", flow.returnTo);
      }

      const client = await getOidcClient();
      const params = client.callbackParams(req);
      const tokenSet = await client.callback(
        config.oidc.redirectUri as string,
        params,
        {
          state: flow.state,
          nonce: flow.nonce,
          code_verifier: flow.codeVerifier,
        }
      );
      const claims = tokenSet.claims() as Record<string, unknown>;
      const issuer = client.issuer.issuer;
      const subject = readStringClaim(claims, "sub");
      if (!subject) {
        return redirectToLoginWithError(req, res, "missing_subject", flow.returnTo);
      }

      const rawEmail =
        readStringClaim(claims, config.oidc.emailClaim) ??
        readStringClaim(claims, "email");
      if (!rawEmail) {
        return redirectToLoginWithError(req, res, "missing_email", flow.returnTo);
      }
      const normalizedEmail = normalizeEmail(rawEmail);
      const systemConfig = await ensureSystemConfig();
      const jitProvisioningEnabled =
        typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
          ? systemConfig.oidcJitProvisioningEnabled
          : config.oidc.jitProvisioning;

      const emailVerified = readBooleanClaim(claims, config.oidc.emailVerifiedClaim);
      if (config.oidc.requireEmailVerified && emailVerified !== true) {
        return redirectToLoginWithError(req, res, "unverified_email", flow.returnTo);
      }

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

          const activeUsers = await tx.user.count({ where: { isActive: true } });
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

        return resolvedUser;
      });

      if (!user.isActive) {
        return redirectToLoginWithError(req, res, "account_inactive", flow.returnTo);
      }

      const { accessToken, refreshToken } = generateTokens(user.id, user.email);
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
            return redirectToLoginWithError(req, res, "callback_failed", flow.returnTo);
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
        return redirectToLoginWithError(req, res, "provisioning_disabled", flow.returnTo);
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return redirectToLoginWithError(req, res, "callback_failed", flow.returnTo);
      }

      console.error("OIDC callback error:", error);
      return redirectToLoginWithError(req, res, "callback_failed", flow.returnTo);
    }
  });
};
