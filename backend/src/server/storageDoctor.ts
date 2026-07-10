/**
 * Startup "storage doctor": prints a single boxed STORAGE block summarising
 * how file/image blobs and the database are configured, so an operator can
 * confirm at a glance whether they are on sqlite+db-bytes or postgres+S3.
 *
 * Split into a pure renderer (`buildStorageSummary`) and a thin wiring
 * function (`runStorageDoctor`). The renderer takes plain data — no network,
 * no module singletons — so it unit-tests deterministically. The reachability
 * probe (a best-effort S3 HeadBucket) is performed by `runStorageDoctor` and
 * passed in as a result; a failed probe prints an actionable WARNING and never
 * throws, so a misconfigured S3 endpoint cannot crash startup.
 */

/** Minimal shape of the S3 config the doctor renders (no secrets). */
export interface StorageDoctorS3 {
  bucket: string | null;
  region: string;
  endpoint: string | null;
  publicUrl: string | null;
  forcePathStyle: boolean;
}

/** Config subset the doctor needs; keeps it decoupled from the full Config. */
export interface StorageDoctorConfig {
  databaseUrl?: string;
  fileUploadMaxMb: number;
  bodyLimitMb: number;
  backups: { schedule: string | null };
  s3: StorageDoctorS3;
}

/** Result of the best-effort bucket-reachability probe. */
export interface BucketProbeResult {
  ok: boolean;
  /** Failure detail; present only when `ok` is false. */
  error?: string;
}

export interface BuildStorageSummaryDeps {
  config: StorageDoctorConfig;
  /** Whether S3 was initialised (i.e. S3_BUCKET present at boot). */
  s3Enabled: boolean;
  /** Probe outcome; null when S3 is disabled or the probe was skipped. */
  probe?: BucketProbeResult | null;
}

interface DatabaseTarget {
  provider: string;
  /** Human-readable target, never containing credentials. */
  target: string;
}

/**
 * Parse a Prisma connection string into a provider + credential-free target.
 * sqlite → the file path; postgres/mysql → host:port/dbname (user/password
 * are deliberately dropped).
 */
export const parseDatabaseTarget = (databaseUrl?: string): DatabaseTarget => {
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    return { provider: "unknown", target: "<unset>" };
  }

  if (databaseUrl.startsWith("file:")) {
    return { provider: "sqlite", target: databaseUrl.replace(/^file:/, "") };
  }

  try {
    const parsed = new URL(databaseUrl);
    const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
    const provider =
      scheme === "postgres" || scheme === "postgresql"
        ? "postgresql"
        : scheme === "mysql"
          ? "mysql"
          : scheme;
    const host = parsed.hostname || "localhost";
    const port = parsed.port ? `:${parsed.port}` : "";
    const dbName = parsed.pathname.replace(/^\//, "") || "<default>";
    return { provider, target: `${host}${port}/${dbName}` };
  } catch {
    return { provider: "unknown", target: "<unparseable>" };
  }
};

/**
 * Build the STORAGE summary as an array of plain content lines (no box
 * borders). Pure: given the same deps it always returns the same lines.
 */
export const buildStorageSummary = (deps: BuildStorageSummaryDeps): string[] => {
  const { config, s3Enabled, probe } = deps;
  const lines: string[] = [];

  const db = parseDatabaseTarget(config.databaseUrl);
  lines.push(`Database:      ${db.provider} (${db.target})`);

  if (s3Enabled && config.s3.bucket) {
    lines.push("File storage:  s3");
    lines.push(`  Bucket:      ${config.s3.bucket}`);
    lines.push(`  Region:      ${config.s3.region}`);
    lines.push(`  Endpoint:    ${config.s3.endpoint ?? "AWS default"}`);
    lines.push(`  Public URL:  ${config.s3.publicUrl ?? "(virtual-hosted-style)"}`);
    lines.push(`  Path style:  ${config.s3.forcePathStyle ? "on" : "off"}`);

    if (probe && probe.ok) {
      lines.push("  Reachable:   yes (HeadBucket ok)");
    } else if (probe && !probe.ok) {
      lines.push("  Reachable:   NO");
      lines.push(
        `  WARNING: could not reach bucket '${config.s3.bucket}': ${probe.error ?? "unknown error"}`,
      );
      lines.push(
        "  Likely a bad credential, endpoint, or missing bucket. S3 uploads will fail until fixed.",
      );
    }

    // getPublicUrl's per-request warning is surfaced here instead, once.
    if (config.s3.endpoint && !config.s3.publicUrl) {
      lines.push(
        "  WARNING: custom S3_ENDPOINT set without S3_PUBLIC_URL; public image URLs may not resolve.",
      );
      lines.push(
        "  Set S3_PUBLIC_URL to the public base URL of your bucket or CDN.",
      );
    }
  } else {
    lines.push("File storage:  database (default)");
    lines.push("  Image blobs are stored in the database (DrawingFile.data).");
  }

  lines.push(`Limits:        FILE_UPLOAD_MAX_MB=${config.fileUploadMaxMb} (per image), BODY_LIMIT_MB=${config.bodyLimitMb} (scene JSON)`);

  const schedule = config.backups.schedule;
  lines.push(
    schedule && schedule.trim().length > 0
      ? `Backups:       on (${schedule})`
      : "Backups:       off",
  );

  return lines;
};

/**
 * Wrap content lines in a titled ASCII box for the startup log.
 */
export const renderStorageBox = (title: string, lines: string[]): string => {
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 2;
  const top = `+${"-".repeat(width)}+`;
  const pad = (text: string) => `| ${text.padEnd(width - 1)}|`;
  return [top, pad(title), pad("-".repeat(title.length)), ...lines.map(pad), top].join("\n");
};

/** Full dependency surface for the wired-up doctor. */
export interface RunStorageDoctorDeps {
  config: StorageDoctorConfig;
  isS3Enabled: () => boolean;
  /** Best-effort probe; must resolve (never reject) within its own timeout. */
  probeBucket: () => Promise<BucketProbeResult>;
  logger?: Pick<typeof console, "log">;
}

/**
 * Run the doctor: probe S3 when enabled, render the box, print it once.
 * Never throws — a probe failure becomes a WARNING line, not a crash.
 */
export const runStorageDoctor = async (deps: RunStorageDoctorDeps): Promise<void> => {
  const logger = deps.logger ?? console;
  const s3Enabled = deps.isS3Enabled();

  let probe: BucketProbeResult | null = null;
  if (s3Enabled) {
    try {
      probe = await deps.probeBucket();
    } catch (error) {
      probe = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const lines = buildStorageSummary({ config: deps.config, s3Enabled, probe });
  logger.log(`\n${renderStorageBox("STORAGE", lines)}\n`);
};
