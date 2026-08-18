import nodemailer from "nodemailer";
import type { MailMessage, MailResult, Mailer } from "./mailer";

export type SmtpMailerOptions = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  replyTo?: string | null;
};

/**
 * SMTP-backed mailer.
 *
 * Most self-hosters already run a mail server or have a relay from their
 * provider, so SMTP keeps delivery inside infrastructure they control instead
 * of adding another processor to the data path.
 */
export const createSmtpMailer = ({
  host,
  port,
  secure,
  user,
  password,
  from,
  replyTo,
}: SmtpMailerOptions): Mailer => {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });

  return {
    enabled: true,
    async send(message: MailMessage): Promise<MailResult> {
      try {
        // idempotencyKey is intentionally unused: SMTP has no equivalent, and
        // a reset mail arriving twice is harmless compared to not arriving.
        const info = await transport.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(replyTo ? { replyTo } : {}),
        });
        return { delivered: true, id: info.messageId ?? null };
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        return { delivered: false, reason };
      }
    },
  };
};
