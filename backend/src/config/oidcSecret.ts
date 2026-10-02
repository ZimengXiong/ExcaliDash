import { readFileSync } from "node:fs";
import { readOptionalString } from "./env";

export const resolveOidcClientSecret = (): string | null => {
  const direct = readOptionalString("OIDC_CLIENT_SECRET");
  const file = readOptionalString("OIDC_CLIENT_SECRET_FILE");
  if (!file) return direct;
  if (direct)
    throw new Error(
      "Use only one of OIDC_CLIENT_SECRET and OIDC_CLIENT_SECRET_FILE",
    );
  let secret: string;
  try {
    secret = readFileSync(file, "utf8")
      .replace(/[\r\n]/g, "")
      .trim();
  } catch {
    throw new Error("OIDC_CLIENT_SECRET_FILE is not readable");
  }
  if (!secret) throw new Error("OIDC_CLIENT_SECRET_FILE is empty");
  return secret;
};
