import { Request, Response } from "express";
import { Prisma } from "../generated/client";
import { logAuditEvent } from "../utils/audit";
import type { RegisterOidcRoutesDeps } from "./oidcRoutes";
import { hashTokenForStorage } from "./tokenSecurity";
import {
  canUseIdTokenSigningAlg,
  decodeFlowPayload,
  normalizeClaimGroups,
  normalizeEmail,
  OIDC_FLOW_COOKIE_NAME,
  OIDC_PROVIDER_KEY,
  parseJwtAlgMismatchError,
  readBooleanClaim,
  readClaimByPath,
  readStringClaim,
} from "./oidcRouteHelpers";

type OidcUser = {
  id: string;
  username: string | null;
  email: string;
  name: string;
  role: string;
  mustResetPassword: boolean;
  isActive: boolean;
};

type RegisterOidcCallbackRouteDeps = RegisterOidcRoutesDeps & {
  clearOidcFlowCookie: (req: Request, res: Response) => void;
  redirectToLoginWithError: (
    req: Request,
    res: Response,
    errorCode: string,
    returnTo?: string,
  ) => void;
  getOidcClient: () => Promise<any>;
  buildOidcClient: (
    idTokenSignedResponseAlgOverride?: string | null,
  ) => Promise<any>;
};

export const registerOidcCallbackRoute = (
  deps: RegisterOidcCallbackRouteDeps,
) => {
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
    clearOidcFlowCookie,
    redirectToLoginWithError,
    getOidcClient,
    buildOidcClient,
  } = deps;
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
        data: { id: trashCollectionId, name: "Trash", userId },
      });
    }
  };
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
      const idTokenClaims = tokenSet.claims() as Record<string, unknown>;
      let userinfoClaims: Record<string, unknown> = {};
      const emailMissingFromIdToken =
        !readStringClaim(idTokenClaims, config.oidc.emailClaim) &&
        !readStringClaim(idTokenClaims, "email");
      if (emailMissingFromIdToken) {
        try {
          userinfoClaims = (await client.userinfo(tokenSet)) as Record<
            string,
            unknown
          >;
        } catch (userinfoError) {
          console.error(
            "OIDC: userinfo request failed, falling back to ID token claims only:",
            userinfoError,
          );
        }
      }
      const claims: Record<string, unknown> = {
        ...userinfoClaims,
        ...idTokenClaims,
      };
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
      // Trust email verification only from the signed ID token, never from the
      // unsigned UserInfo response — otherwise a provider/tenant that lets a
      // user assert email_verified could match an existing account by email.
      const emailVerified = readBooleanClaim(
        idTokenClaims,
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
          where: { issuer_subject: { issuer, subject } },
          include: { user: { select: userSelect } },
        });
        if (linkedIdentity) {
          await tx.authIdentity.update({
            where: { id: linkedIdentity.id },
            data: { lastLoginAt: new Date(), emailAtLink: normalizedEmail },
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
          select: { id: true, issuer: true, subject: true },
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
        { authProvider: "oidc", oidcGroups },
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
          details: { provider: config.oidc.providerName, issuer },
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
