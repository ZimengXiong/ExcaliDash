import type { Request } from "express";

const parseForwardedFor = (forwardedFor: string | string[] | undefined): string | null => {
  if (!forwardedFor) return null;
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  const first = raw
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return first || null;
};

export const getClientIp = (req: Request): string => {
  const fromForwardedFor = parseForwardedFor(req.headers["x-forwarded-for"]);
  if (fromForwardedFor) return fromForwardedFor.slice(0, 255);

  const fromRequestIp = typeof req.ip === "string" ? req.ip.trim() : "";
  if (fromRequestIp.length > 0) return fromRequestIp.slice(0, 255);

  const fromSocket = req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
  return String(fromSocket).slice(0, 255);
};

