import { Resend } from "resend";
import type { Mailer, MailMessage, MailResult } from "./mailer";
import { createDisabledMailer } from "./mailer";
import { createSmtpMailer } from "./smtpMailer";
import type { MailConfig } from "../config/mail";

export const createResendMailer = ({
  apiKey,
  from,
  replyTo,
}: {
  apiKey: string;
  from: string;
  replyTo?: string | null;
}): Mailer => {
  const client = new Resend(apiKey);

  return {
    enabled: true,
    async send(message: MailMessage): Promise<MailResult> {
      try {
        const { data, error } = await client.emails.send({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(replyTo ? { replyTo } : {}),
          ...(message.idempotencyKey
            ? { idempotencyKey: message.idempotencyKey }
            : {}),
        });
        if (error) {
          return { delivered: false, reason: `${error.name}: ${error.message}` };
        }
        return { delivered: true, id: data?.id ?? null };
      } catch (cause) {
        return {
          delivered: false,
          reason: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
};

export const createMailerFromConfig = (mail: MailConfig): Mailer => {
  if (mail.transport === "none") {
    return createDisabledMailer("No mail transport configured");
  }
  if (!mail.from) return createDisabledMailer("MAIL_FROM is not set");

  if (mail.transport === "smtp") {
    if (!mail.smtp.host) return createDisabledMailer("SMTP_HOST is not set");
    if (Boolean(mail.smtp.user) !== Boolean(mail.smtp.password)) {
      return createDisabledMailer("SMTP_USER and SMTP_PASSWORD must be set together");
    }
    return createSmtpMailer({
      ...mail.smtp,
      host: mail.smtp.host,
      from: mail.from,
      replyTo: mail.replyTo,
    });
  }

  if (!mail.resendApiKey) {
    return createDisabledMailer("RESEND_API_KEY is not set");
  }
  return createResendMailer({
    apiKey: mail.resendApiKey,
    from: mail.from,
    replyTo: mail.replyTo,
  });
};
