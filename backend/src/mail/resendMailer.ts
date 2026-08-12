import { Resend } from "resend";
import type { MailMessage, MailResult, Mailer } from "./mailer";
import { createDisabledMailer } from "./mailer";

export type ResendMailerOptions = {
  apiKey: string;
  from: string;
  replyTo?: string | null;
};

/**
 * Resend-backed mailer.
 *
 * The SDK does not throw on API errors — it resolves with `{ data, error }` —
 * so every failure has to be read off the result. Network faults still reject,
 * which is why the call is wrapped as well.
 */
export const createResendMailer = ({
  apiKey,
  from,
  replyTo,
}: ResendMailerOptions): Mailer => {
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
        const reason = cause instanceof Error ? cause.message : String(cause);
        return { delivered: false, reason };
      }
    },
  };
};

/**
 * Build the mailer for the running configuration. A missing API key or sender
 * is a valid state — self-hosters who never enable password reset should not
 * have to configure mail at all.
 */
export const createMailerFromConfig = (mail: {
  resendApiKey: string | null;
  from: string | null;
  replyTo: string | null;
}): Mailer => {
  if (!mail.resendApiKey) {
    return createDisabledMailer("RESEND_API_KEY is not set");
  }
  if (!mail.from) {
    return createDisabledMailer("MAIL_FROM is not set");
  }
  return createResendMailer({
    apiKey: mail.resendApiKey,
    from: mail.from,
    replyTo: mail.replyTo,
  });
};
