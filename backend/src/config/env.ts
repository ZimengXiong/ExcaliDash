/**
 * Typed environment loader. Along with the dotenv/DATABASE_URL lines in
 * ../config.ts, this module is the ONLY place that reads process.env. Every
 * read resolves through the registry (getSpec) so unknown names throw.
 */
import { getSpec } from "./registry";

const warnedAliases = new Set<string>();

/**
 * Resolve the raw string value for a registered var, falling back through
 * declared aliases (logging a deprecation warning once per alias).
 */
export const readRaw = (name: string): string | undefined => {
  const spec = getSpec(name);
  let value = process.env[name];
  if (value === undefined && spec.aliases) {
    for (const alias of spec.aliases) {
      const aliasValue = process.env[alias];
      if (aliasValue !== undefined) {
        if (!warnedAliases.has(alias)) {
          console.warn(`${alias} is deprecated, use ${name}`);
          warnedAliases.add(alias);
        }
        value = aliasValue;
        break;
      }
    }
  }
  return value;
};

/** Untrimmed optional read with default (matches legacy getOptionalEnv). */
export const readString = (name: string, defaultValue: string): string =>
  readRaw(name) || defaultValue;

/** Trimmed optional read, null when unset/blank (matches legacy getOptionalTrimmedEnv). */
export const readOptionalString = (name: string): string | null => {
  const raw = readRaw(name);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Positive-number read with default (matches legacy getRequiredEnvNumber). */
export const readNumber = (name: string, defaultValue: number): number => {
  const value = readRaw(name);
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid value for environment variable ${name}: must be a positive number`,
    );
  }
  return parsed;
};

/** Boolean read with default (matches legacy getOptionalBoolean). */
export const readBoolean = (name: string, defaultValue: boolean): boolean => {
  const value = readRaw(name);
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
};

/** Comma-separated list read, empty array when unset (matches legacy parseCsvEnvList). */
export const readCsv = (name: string): string[] => {
  const raw = readRaw(name);
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};
