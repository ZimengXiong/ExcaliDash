export type EnvKind = "string" | "number" | "boolean" | "enum" | "csv";

export interface EnvVarSpec {
  name: string;
  group:
    | "Server"
    | "Database"
    | "Authentication"
    | "OIDC"
    | "Security"
    | "S3 storage"
    | "Backups"
    | "Update check"
    | "Link sharing"
    | "AI"
    | "Frontend (build-time)";
  kind: EnvKind;
  /** Human-readable default shown in docs; omit if none. */
  default?: string;
  /** Enum values. */
  values?: readonly string[];
  secret?: boolean;
  requiredInProduction?: boolean;
  requiredWhenOidcEnabled?: boolean;
  /** Legacy fallback names; reading via alias logs a console.warn once. */
  aliases?: readonly string[];
  /** One sentence, used in generated .env.example comment and docs table. */
  doc: string;
  /** Value placed (commented out) in .env.example. */
  example?: string;
  /** Consumed outside backend/src (docker entrypoint etc.) — documented, never parsed here. */
  docsOnly?: boolean;
}
