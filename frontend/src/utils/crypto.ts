/**
 * Cryptographic utilities for the Private Vault feature.
 * Uses Web Crypto API for secure client-side encryption.
 *
 * Security Model:
 * - PBKDF2 for key derivation (100,000 iterations)
 * - AES-256-GCM for authenticated encryption
 * - Random IV per encryption operation
 * - Zero-knowledge: server never sees plaintext private data
 */

// Constants for cryptographic operations
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const KEY_LENGTH = 256; // AES-256

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Generate a random IV for encryption
 */
export function generateIV(): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * Convert Uint8Array to hex string for storage
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string back to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Derive an encryption key from a password using PBKDF2
 * @param password - The user's password
 * @param salt - Salt for key derivation (should be stored for later decryption)
 * @returns CryptoKey suitable for AES-GCM encryption
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Import password as a key
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Create a proper ArrayBuffer from the salt
  const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;

  // Derive the actual encryption key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false, // Not extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt drawing data using AES-256-GCM
 * @param data - Drawing data (elements, appState, files)
 * @param key - Derived encryption key
 * @returns Encrypted data as base64 string and IV as hex string
 */
export async function encryptDrawing(
  data: { elements: any[]; appState: any; files: any },
  key: CryptoKey
): Promise<{ encryptedData: string; iv: string }> {
  const iv = generateIV();
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer;

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    plaintext
  );

  return {
    encryptedData: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypt drawing data using AES-256-GCM
 * @param encryptedData - Base64 encoded encrypted data
 * @param iv - Hex encoded initialization vector
 * @param key - Derived encryption key
 * @returns Decrypted drawing data
 */
export async function decryptDrawing(
  encryptedData: string,
  iv: string,
  key: CryptoKey
): Promise<{ elements: any[]; appState: any; files: any }> {
  const ciphertext = Uint8Array.from(atob(encryptedData), (c) =>
    c.charCodeAt(0)
  );
  const ivBytes = hexToBytes(iv);
  const ivBuffer = new Uint8Array(ivBytes).buffer as ArrayBuffer;

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * Encrypt a simple string (e.g., drawing name)
 * @param str - String to encrypt
 * @param key - Derived encryption key
 * @returns Encrypted string as base64 with IV prefix
 */
export async function encryptString(
  str: string,
  key: CryptoKey
): Promise<string> {
  const iv = generateIV();
  const plaintext = new TextEncoder().encode(str);
  const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer;

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    plaintext
  );

  // Combine IV and ciphertext for storage
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a string encrypted with encryptString
 * @param encrypted - Base64 encoded encrypted string (IV + ciphertext)
 * @param key - Derived encryption key
 * @returns Decrypted string
 */
export async function decryptString(
  encrypted: string,
  key: CryptoKey
): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer;

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Hash a password for storage (client-side hash before sending to server)
 * Server will apply bcrypt on top of this for additional security
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Validate password strength
 * Returns an object with validation results
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score++;
  } else {
    feedback.push("Password should be at least 8 characters");
  }

  if (password.length >= 12) {
    score++;
  }

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push("Include both uppercase and lowercase letters");
  }

  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push("Include at least one number");
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score++;
  } else {
    feedback.push("Include at least one special character");
  }

  return {
    isValid: password.length >= 8,
    score: Math.min(score, 4),
    feedback,
  };
}

/**
 * Generate a locked preview SVG placeholder
 */
export function generateLockedPreview(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
    <rect width="200" height="150" fill="#f1f5f9"/>
    <rect x="75" y="45" width="50" height="40" rx="4" fill="#94a3b8"/>
    <rect x="85" y="30" width="30" height="25" rx="15" fill="none" stroke="#94a3b8" stroke-width="6"/>
    <circle cx="100" cy="65" r="4" fill="#f1f5f9"/>
    <rect x="98" y="65" width="4" height="10" fill="#f1f5f9"/>
    <text x="100" y="110" font-family="system-ui" font-size="12" fill="#64748b" text-anchor="middle">Private Drawing</text>
  </svg>`;
}
