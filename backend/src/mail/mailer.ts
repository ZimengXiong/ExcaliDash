/**
 * Outbound mail.
 *
 * ExcaliDash runs on machines that may have no mail infrastructure at all, so
 * delivery is optional by design: without a configured provider the mailer
 * reports that it is disabled and callers keep their existing behaviour.
 */
export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Deduplicates retries of the same logical send within the provider. */
  idempotencyKey?: string;
};

export type MailResult =
  | { delivered: true; id: string | null }
  | { delivered: false; reason: string };

export interface Mailer {
  /** False when no provider is configured; callers can skip work entirely. */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<MailResult>;
}

/** Used whenever no provider is configured. Never throws, never sends. */
export const createDisabledMailer = (
  reason = "No mail provider configured",
): Mailer => ({
  enabled: false,
  async send() {
    return { delivered: false, reason };
  },
});
