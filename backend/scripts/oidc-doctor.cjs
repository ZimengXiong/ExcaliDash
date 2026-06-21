#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REQUIRED = ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_REDIRECT_URI"];

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = value;
  }
  return out;
};

const trimOrNull = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const timeoutFetch = async (url, opts = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const inferProvider = ({ issuerUrl, metadata }) => {
  const raw = `${issuerUrl || ""} ${metadata?.issuer || ""} ${metadata?.authorization_endpoint || ""}`.toLowerCase();
  if (raw.includes("/realms/") || raw.includes("keycloak")) return "keycloak";
  if (raw.includes("/application/o/") || raw.includes("authentik")) return "authentik";
  return "generic";
};

const pickExpectedIdTokenAlg = ({ configured, hasClientSecret, supported }) => {
  if (configured) return configured;
  if (!Array.isArray(supported) || supported.length === 0) return "RS256";
  const clean = supported.filter((alg) => typeof alg === "string" && alg.trim().length > 0).map((alg) => alg.trim());

  const preferred = ["RS256", "PS256", "ES256", "EdDSA", "RS384", "PS384", "ES384", "RS512", "PS512", "ES512"];
  for (const candidate of preferred) {
    if (clean.includes(candidate)) return candidate;
  }

  const firstAsymmetric = clean.find((alg) => !/^HS/i.test(alg) && alg.toLowerCase() !== "none");
  if (firstAsymmetric) return firstAsymmetric;

  const hs = clean.filter((alg) => /^HS/i.test(alg));
  if (hs.length > 0) {
    if (!hasClientSecret) {
      throw new Error(
        "Provider only advertises HS* ID token algs, but OIDC_CLIENT_SECRET is missing. Use a confidential client or configure an asymmetric alg (for example RS256)."
      );
    }
    for (const candidate of ["HS256", "HS384", "HS512"]) {
      if (hs.includes(candidate)) return candidate;
    }
    return hs[0];
  }
  return "RS256";
};

const printLine = (label, value) => {
  console.log(`${label.padEnd(36)} ${value}`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const issuerUrl = trimOrNull(args.issuer || process.env.OIDC_ISSUER_URL);
  const clientId = trimOrNull(args["client-id"] || process.env.OIDC_CLIENT_ID);
  const clientSecret = trimOrNull(args["client-secret"] || process.env.OIDC_CLIENT_SECRET);
  const redirectUri = trimOrNull(args["redirect-uri"] || process.env.OIDC_REDIRECT_URI);
  const providerName = trimOrNull(args.provider || process.env.OIDC_PROVIDER_NAME || "OIDC");
  const configuredAlg = trimOrNull(args.alg || process.env.OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG);

  const envView = {
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_CLIENT_ID: clientId,
    OIDC_REDIRECT_URI: redirectUri,
  };
  const missing = REQUIRED.filter((key) => !envView[key]);
  if (missing.length > 0) {
    console.error(`Missing required OIDC settings: ${missing.join(", ")}`);
    console.error("Set them in backend/.env or pass --issuer --client-id --redirect-uri.");
    process.exit(2);
  }

  const baseIssuer = issuerUrl.replace(/\/+$/, "");
  const discoveryCandidates = issuerUrl.includes("/.well-known/openid-configuration")
    ? [issuerUrl]
    : [
        `${baseIssuer}/.well-known/openid-configuration`,
        `${baseIssuer.replace(/\/application\/o\/[^/]+$/i, "")}/.well-known/openid-configuration`,
      ];

  let metadata = null;
  let discoveryUrl = null;
  let discoveryError = null;
  for (const candidate of discoveryCandidates) {
    try {
      const res = await timeoutFetch(candidate);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      metadata = await res.json();
      discoveryUrl = candidate;
      break;
    } catch (error) {
      discoveryError = error;
    }
  }
  if (!metadata) {
    console.error(`OIDC discovery failed for issuer: ${issuerUrl}`);
    console.error(`Last error: ${discoveryError?.message || String(discoveryError)}`);
    process.exit(3);
  }

  const provider = inferProvider({ issuerUrl, metadata });
  const supportedAuthMethods = Array.isArray(metadata.token_endpoint_auth_methods_supported)
    ? metadata.token_endpoint_auth_methods_supported
    : [];
  const supportedIdAlgs = Array.isArray(metadata.id_token_signing_alg_values_supported)
    ? metadata.id_token_signing_alg_values_supported
    : [];

  let expectedAlg;
  try {
    expectedAlg = pickExpectedIdTokenAlg({
      configured: configuredAlg,
      hasClientSecret: Boolean(clientSecret),
      supported: supportedIdAlgs,
    });
  } catch (error) {
    console.error(`OIDC algorithm validation failed: ${error.message}`);
    process.exit(4);
  }

  const tokenMethod = clientSecret ? "client_secret_basic/client_secret_post" : "none";
  const authMethodLooksOk = supportedAuthMethods.length === 0
    ? true
    : clientSecret
      ? supportedAuthMethods.some((m) => m === "client_secret_basic" || m === "client_secret_post")
      : supportedAuthMethods.includes("none");

  console.log("ExcaliDash OIDC Doctor");
  console.log("======================");
  printLine("Provider (detected)", provider);
  printLine("Provider name (env)", providerName);
  printLine("Issuer URL", issuerUrl);
  printLine("Discovery URL", discoveryUrl);
  printLine("Client ID", clientId);
  printLine("Client secret configured", clientSecret ? "yes" : "no");
  printLine("Redirect URI", redirectUri);
  printLine("Token auth expectation", tokenMethod);
  printLine("Token auth compatibility", authMethodLooksOk ? "ok" : "mismatch");
  printLine(
    "Recommended ID token alg",
    configuredAlg ? `${expectedAlg} (from OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG)` : `${expectedAlg} (auto)`
  );

  if (!authMethodLooksOk) {
    console.log("");
    console.log("Action needed:");
    if (clientSecret) {
      console.log("- IdP doesn't advertise client_secret_basic/post; configure one of those methods or switch to supported method in IdP.");
    } else {
      console.log("- IdP doesn't advertise public client token auth method `none`; either mark client as public or set OIDC_CLIENT_SECRET.");
    }
  }

  console.log("");
  console.log("Recommended backend env:");
  console.log(`AUTH_MODE=oidc_enforced`);
  console.log(`OIDC_PROVIDER_NAME=${provider === "generic" ? providerName : provider === "keycloak" ? "Keycloak" : "Authentik"}`);
  console.log(`OIDC_ISSUER_URL=${issuerUrl}`);
  console.log(`OIDC_CLIENT_ID=${clientId}`);
  if (clientSecret) console.log("OIDC_CLIENT_SECRET=<redacted>");
  console.log(`OIDC_REDIRECT_URI=${redirectUri}`);
  if (configuredAlg || expectedAlg !== "RS256") {
    console.log(`OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG=${expectedAlg}`);
  }

  console.log("");
  if (provider === "keycloak") {
    console.log("Keycloak checklist:");
    console.log("- Issuer should look like: https://<host>/realms/<realm>");
    console.log("- Client: OpenID Connect, Standard Flow enabled.");
    console.log("- Redirect URI must include exact callback URL.");
  } else if (provider === "authentik") {
    console.log("Authentik checklist:");
    console.log("- Issuer should look like: https://<host>/application/o/<provider-slug>/");
    console.log("- Provider type: OAuth2/OpenID Connect.");
    console.log("- Add exact callback as Strict redirect URI.");
    console.log("- Ensure `email` and `email_verified` claims are mapped as expected.");
  } else {
    console.log("Generic OIDC checklist:");
    console.log("- Verify issuer and callback are exact.");
    console.log("- Verify token endpoint auth method matches client type.");
    console.log("- Verify provider signs ID tokens with the selected alg.");
  }

  if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.jwks_uri) {
    console.log("");
    console.log("Warning: discovery metadata missing one or more required endpoints (authorization/token/jwks).");
    process.exitCode = 5;
  }
};

main().catch((error) => {
  console.error("OIDC doctor failed:", error?.message || String(error));
  process.exit(1);
});
