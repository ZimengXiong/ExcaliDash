import type { EnvVarSpec } from "./types";

export const storageEnv: readonly EnvVarSpec[] = [
  {
    name: "S3_BUCKET",
    group: "S3 storage",
    kind: "string",
    doc: "S3 bucket name; setting this enables S3-backed file storage.",
  },
  {
    name: "S3_REGION",
    group: "S3 storage",
    kind: "string",
    default: "us-east-1",
    doc: "S3 region.",
  },
  {
    name: "S3_ENDPOINT",
    group: "S3 storage",
    kind: "string",
    doc: "Custom endpoint for S3-compatible services (MinIO, R2, etc.).",
  },
  {
    name: "S3_PUBLIC_URL",
    group: "S3 storage",
    kind: "string",
    doc: "Public base URL/CDN for objects; required for non-AWS endpoints.",
  },
  {
    name: "S3_FORCE_PATH_STYLE",
    group: "S3 storage",
    kind: "boolean",
    default: "false",
    doc: "Force path-style addressing (required for MinIO).",
  },
  {
    name: "S3_KEY_PREFIX",
    group: "S3 storage",
    kind: "string",
    default: "excalidash",
    doc: "Object-key prefix for stored files; trailing slashes are stripped.",
  },
  {
    name: "AWS_ACCESS_KEY_ID",
    group: "S3 storage",
    kind: "string",
    secret: true,
    doc: "S3 access key ID; omit to use the ambient IAM credential chain.",
  },
  {
    name: "AWS_SECRET_ACCESS_KEY",
    group: "S3 storage",
    kind: "string",
    secret: true,
    doc: "S3 secret access key; omit to use the ambient IAM credential chain.",
  },
];

export const backupEnv: readonly EnvVarSpec[] = [
  {
    name: "BACKUP_SCHEDULE",
    group: "Backups",
    kind: "string",
    doc: "Cron expression for scheduled backups; unset disables scheduling.",
    example: "0 3 * * *",
  },
  {
    name: "BACKUP_DIR",
    group: "Backups",
    kind: "string",
    default: "<backend>/backups",
    doc: "Directory where database backups are written.",
  },
  {
    name: "BACKUP_RETENTION_DAYS",
    group: "Backups",
    kind: "number",
    default: "14",
    doc: "Number of days to retain backups before pruning.",
  },
];
