import { describe, expect, it } from "vitest";
import { createDisabledMailer } from "../mail/mailer";
import { createMailerFromConfig } from "../mail/resendMailer";
import { buildPasswordResetEmail } from "../mail/templates/passwordReset";
import type { MailConfig } from "../config/mail";

const baseConfig: MailConfig = {
  transport: "none",
  resendApiKey: null,
  from: "ExcaliDash <noreply@example.com>",
  replyTo: null,
  smtp: {
    host: null,
    port: 587,
    secure: false,
    user: null,
    password: null,
  },
};

describe("mail transport selection", () => {
  it("stays disabled when no transport is configured", async () => {
    const mailer = createMailerFromConfig(baseConfig);
    expect(mailer.enabled).toBe(false);
    await expect(mailer.send({ to: "a@example.com", subject: "s", html: "h", text: "t" }))
      .resolves.toEqual({ delivered: false, reason: "No mail transport configured" });
  });

  it("requires SMTP credentials as a pair", () => {
    const mailer = createMailerFromConfig({
      ...baseConfig,
      transport: "smtp",
      smtp: { ...baseConfig.smtp, host: "smtp.example.com", user: "user" },
    });
    expect(mailer.enabled).toBe(false);
  });

  it("enables configured SMTP", () => {
    const mailer = createMailerFromConfig({
      ...baseConfig,
      transport: "smtp",
      smtp: { ...baseConfig.smtp, host: "smtp.example.com" },
    });
    expect(mailer.enabled).toBe(true);
  });

  it("never throws when disabled", async () => {
    await expect(createDisabledMailer("off").send({
      to: "a@example.com",
      subject: "s",
      html: "h",
      text: "t",
    })).resolves.toEqual({ delivered: false, reason: "off" });
  });
});

describe("password reset email", () => {
  it("includes the reset link in both parts and escapes HTML", () => {
    const resetUrl = 'https://example.com/reset?token="><script>alert(1)</script>';
    const message = buildPasswordResetEmail({ resetUrl, expiresInMinutes: 60 });
    expect(message.text).toContain(resetUrl);
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("60 minutes");
  });
});
