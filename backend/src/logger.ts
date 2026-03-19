import pino from "pino";

const isProduction = (process.env.NODE_ENV || "development") === "production";
const isTest = process.env.NODE_ENV === "test";

export const logger = pino({
  level: isTest ? "silent" : isProduction ? "info" : "debug",
  ...(isProduction
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true } } }),
  redact: {
    paths: ["password", "token", "req.headers.authorization", "req.headers.cookie"],
    censor: "[REDACTED]",
  },
});
