export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};

export type MailResult =
  | { delivered: true; id: string | null }
  | { delivered: false; reason: string };

export interface Mailer {
  readonly enabled: boolean;
  send(message: MailMessage): Promise<MailResult>;
}

export const createDisabledMailer = (
  reason = "No mail provider configured",
): Mailer => ({
  enabled: false,
  async send() {
    return { delivered: false, reason };
  },
});
