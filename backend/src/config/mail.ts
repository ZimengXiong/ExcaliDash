import { readBoolean, readNumber, readOptionalString, readRaw } from "./env";

export type MailTransport = "resend" | "smtp" | "none";

export interface MailConfig {
  transport: MailTransport;
  resendApiKey: string | null;
  from: string | null;
  replyTo: string | null;
  smtp: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    password: string | null;
  };
}

const resolveTransport = (
  resendApiKey: string | null,
  smtpHost: string | null,
): MailTransport => {
  const explicit = readRaw("MAIL_TRANSPORT")?.trim().toLowerCase();
  if (explicit === "resend" || explicit === "smtp" || explicit === "none") {
    return explicit;
  }
  if (explicit) {
    throw new Error("MAIL_TRANSPORT must be one of: resend, smtp, none");
  }
  if (resendApiKey) return "resend";
  if (smtpHost) return "smtp";
  return "none";
};

export const resolveMailConfig = (): MailConfig => {
  const resendApiKey = readOptionalString("RESEND_API_KEY");
  const smtpHost = readOptionalString("SMTP_HOST");

  return {
    transport: resolveTransport(resendApiKey, smtpHost),
    resendApiKey,
    from: readOptionalString("MAIL_FROM"),
    replyTo: readOptionalString("MAIL_REPLY_TO"),
    smtp: {
      host: smtpHost,
      port: readNumber("SMTP_PORT", 587),
      secure: readBoolean("SMTP_SECURE", false),
      user: readOptionalString("SMTP_USER"),
      password: readOptionalString("SMTP_PASSWORD"),
    },
  };
};
