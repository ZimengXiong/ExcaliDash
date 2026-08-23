import nodemailer from "nodemailer";
import type { Mailer, MailMessage, MailResult } from "./mailer";

export type SmtpMailerOptions = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  replyTo?: string | null;
};

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
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });

  return {
    enabled: true,
    async send(message: MailMessage): Promise<MailResult> {
      try {
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
        return {
          delivered: false,
          reason: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
};
