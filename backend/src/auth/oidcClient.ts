import { Issuer } from "openid-client";
import {
  canonicalizeIssuerUrl,
  resolveIdTokenSignedResponseAlg,
} from "./oidcRouteHelpers";
import type { RegisterOidcRoutesDeps } from "./oidcRoutes";

export const createOidcClientFactory = (
  config: RegisterOidcRoutesDeps["config"],
) => {
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
  return { buildOidcClient, getOidcClient };
};
