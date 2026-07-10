import crypto from "crypto";
import { config } from "../config";

// AES-256-GCM secret storage for the admin-provided AI API key. The 32-byte key
// is derived from the existing API-key-hash pepper via scrypt with a fixed,
// non-secret salt so the derivation is stable across restarts. This is the same
// pepper that protects API-key hashes; production deployments already override
// it (a default pepper triggers a production config error elsewhere).
const KEY_DERIVATION_SALT = "excalidash-ai-key-v1";
const ENC_PREFIX = "aesgcm";

const deriveKey = (): Buffer =>
  crypto.scryptSync(config.apiKeyHashPepper, KEY_DERIVATION_SALT, 32);

/**
 * Encrypt a plaintext secret. Output format:
 *   aesgcm$<iv-base64>$<authTag-base64>$<ciphertext-base64>
 * so it is self-describing and safe to store in a TEXT column.
 */
export const encryptSecret = (plaintext: string): string => {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENC_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join("$");
};

/**
 * Decrypt a value produced by encryptSecret. Returns null on any malformed or
 * tampered input rather than throwing, so a corrupt stored key degrades to
 * "no DB key" instead of crashing the request.
 */
export const decryptSecret = (stored: string | null | undefined): string | null => {
  if (!stored) return null;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ENC_PREFIX) return null;
  try {
    const key = deriveKey();
    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
};
