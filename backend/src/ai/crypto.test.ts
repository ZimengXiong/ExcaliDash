import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

describe("ai/crypto", () => {
  it("round-trips a secret", () => {
    const plaintext = "sk-super-secret-key-123";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.startsWith("aesgcm$")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces distinct ciphertexts for the same input (random IV)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("returns null for null/empty/malformed input", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("not-encrypted")).toBeNull();
    expect(decryptSecret("aesgcm$only$two")).toBeNull();
  });

  it("returns null for a tampered ciphertext (auth tag mismatch)", () => {
    const encrypted = encryptSecret("secret");
    const parts = encrypted.split("$");
    parts[3] = Buffer.from("tampered-bytes").toString("base64");
    expect(decryptSecret(parts.join("$"))).toBeNull();
  });
});
