/**
 * S3 client setup and helper utilities for presigned URL generation.
 * Supports AWS S3 and S3-compatible services (Cloudflare R2, MinIO, Alibaba OSS, etc.)
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3Config {
  bucket: string;
  region: string;
  /** Optional custom endpoint for S3-compatible services (e.g. MinIO, Cloudflare R2) */
  endpoint?: string;
  /** Optional public base URL for public-read buckets or CDN (e.g. https://cdn.example.com) */
  publicUrl?: string;
  /** Force path-style addressing (required for MinIO, must be false for Alibaba Cloud OSS) */
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

let s3Client: S3Client | null = null;
let s3Config: S3Config | null = null;

/**
 * Initialize the S3 client. Called once on backend startup when S3 env vars are present.
 */
export const initS3 = (cfg: S3Config): void => {
  s3Config = cfg;

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: cfg.region,
  };

  if (cfg.endpoint) {
    clientConfig.endpoint = cfg.endpoint;
    // Path-style is required for MinIO but must be false for services like
    // Alibaba Cloud OSS that use virtual-hosted-style URLs.
    clientConfig.forcePathStyle = cfg.forcePathStyle ?? false;
  }

  if (cfg.accessKeyId && cfg.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    };
  }

  s3Client = new S3Client(clientConfig);
};

/** Returns true when S3 has been initialised (i.e. S3_BUCKET is configured). */
export const isS3Enabled = (): boolean =>
  s3Client !== null && s3Config !== null;

/** Returns the active S3 configuration, or null if S3 is disabled. */
export const getS3Config = (): S3Config | null => s3Config;

/**
 * Generate a presigned PUT URL that allows a browser to upload a single object directly to S3.
 * @param key      S3 object key
 * @param mimeType Content-Type of the upload
 * @param expiresInSeconds URL validity window (default: 5 minutes)
 */
export const generatePresignedUploadUrl = async (
  key: string,
  mimeType: string,
  expiresInSeconds = 300
): Promise<string> => {
  if (!s3Client || !s3Config) {
    throw new Error("S3 is not configured");
  }

  const command = new PutObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
    ContentType: mimeType,
    // Image keys contain a content hash, so they are immutable — cache
    // aggressively to reduce repeated downloads from S3/CDN.
    CacheControl: "public, max-age=31536000, immutable",
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Generate a presigned GET URL for reading a private S3 object.
 * @param key             S3 object key
 * @param expiresInSeconds URL validity window (default: 1 hour)
 */
export const generatePresignedDownloadUrl = async (
  key: string,
  expiresInSeconds = 3600
): Promise<string> => {
  if (!s3Client || !s3Config) {
    throw new Error("S3 is not configured");
  }

  const command = new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
    ResponseCacheControl: "public, max-age=31536000, immutable",
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Build the public access URL for an object in a public-read bucket or behind a CDN.
 * Falls back to the standard virtual-hosted-style S3 URL when S3_PUBLIC_URL is not set.
 *
 * NOTE: When using a custom S3-compatible endpoint (MinIO, R2, etc.) without
 * setting S3_PUBLIC_URL, this function logs a warning and returns a best-effort
 * AWS-style URL that will likely not resolve correctly.  Always set S3_PUBLIC_URL
 * when using non-AWS endpoints.
 */
export const getPublicUrl = (key: string): string => {
  if (!s3Config) {
    throw new Error("S3 is not configured");
  }

  if (s3Config.publicUrl) {
    const base = s3Config.publicUrl.endsWith("/")
      ? s3Config.publicUrl.slice(0, -1)
      : s3Config.publicUrl;
    return `${base}/${key}`;
  }

  if (s3Config.endpoint) {
    // Custom endpoint without S3_PUBLIC_URL is ambiguous — the URL format
    // varies between MinIO, Cloudflare R2, and other services.
    console.warn(
      "[S3] S3_PUBLIC_URL is not set but a custom S3_ENDPOINT is configured. " +
        "Public image URLs may not resolve correctly. Set S3_PUBLIC_URL to the " +
        "public base URL of your bucket or CDN."
    );
  }

  // Standard AWS virtual-hosted-style URL.
  return `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
};

/**
 * Delete an object from S3. Best-effort — errors are thrown to the caller.
 */
export const deleteS3Object = async (key: string): Promise<void> => {
  if (!s3Client || !s3Config) {
    throw new Error("S3 is not configured");
  }

  const command = new DeleteObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
  });

  await s3Client.send(command);
};
