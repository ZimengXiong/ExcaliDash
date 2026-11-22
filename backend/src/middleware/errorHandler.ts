/**
 * Error handling middleware
 * Sanitizes error messages in production to prevent information leakage
 */
import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  type?: string;
  code?: string;
}

/**
 * Error handler middleware
 * Should be added last in the middleware chain
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;
  const isDevelopment = config.nodeEnv === "development";
  const isEncodingError =
    (statusCode === 415 && err.type === "encoding.unsupported") ||
    (statusCode === 400 &&
      req.get("content-encoding")?.toLowerCase() === "gzip" &&
      (err.code === "Z_DATA_ERROR" || err.code === "Z_BUF_ERROR"));
  const encodingDetails = isEncodingError
    ? { code: "REQUEST_ENCODING_ERROR" }
    : {};

  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  if (!isDevelopment) {
    if (statusCode >= 500) {
      res.status(statusCode).json({
        error: "Internal server error",
        message: "An error occurred while processing your request",
      });
      return;
    }

    res.status(statusCode).json({
      error: "Request error",
      message: err.isOperational ? err.message : "Invalid request",
      ...encodingDetails,
    });
    return;
  }

  res.status(statusCode).json({
    error: err.message,
    stack: err.stack,
    statusCode,
    ...encodingDetails,
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = <T = void>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
