import { describe, expect, it, vi } from "vitest";
import { createDisabledMailer } from "../mail/mailer";
import { createMailerFromConfig } from "../mail/resendMailer";
import { buildPasswordResetEmail } from "../mail/templates/passwordReset";

describe("mailer configuration", () => {
  it("is disabled without an API key", async () => {
    const mailer = createMailerFromConfig({
      resendApiKey: null,
      from: "ExcaliDash <noreply@example.com>",
      replyTo: null,
    });

    expect(mailer.enabled).toBe(false);
    await expect(
      mailer.send({ to: "a@example.com", subject: "s", html: "h", text: "t" }),
    ).resolves.toMatchObject({ delivered: false });
  });

  it("is disabled without a sender address", () => {
    const mailer = createMailerFromConfig({
      resendApiKey: "re_test",
      from: null,
      replyTo: null,
    });

    expect(mailer.enabled).toBe(false);
  });

  it("is enabled once key and sender are present", () => {
    const mailer = createMailerFromConfig({
      resendApiKey: "re_test",
      from: "ExcaliDash <noreply@example.com>",
      replyTo: null,
    });

    expect(mailer.enabled).toBe(true);
  });

  it("never throws when disabled", async () => {
    const mailer = createDisabledMailer("nope");
    const result = await mailer.send({
      to: "a@example.com",
      subject: "s",
      html: "h",
      text: "t",
    });

    expect(result).toEqual({ delivered: false, reason: "nope" });
  });
});

describe("password reset template", () => {
  const resetUrl = "https://draw.example.com/reset-password-confirm?token=abc123";

  it("carries the reset link in both parts", () => {
    const mail = buildPasswordResetEmail({ resetUrl, expiresInMinutes: 60 });

    expect(mail.subject).toMatch(/reset/i);
    expect(mail.text).toContain(resetUrl);
    expect(mail.html).toContain(resetUrl);
  });

  it("states the validity period so the copy cannot drift", () => {
    const mail = buildPasswordResetEmail({ resetUrl, expiresInMinutes: 15 });

    expect(mail.text).toContain("15 minutes");
    expect(mail.html).toContain("15 minutes");
  });

  it("escapes the url so a crafted link cannot inject markup", () => {
    const hostile = 'https://x.test/?t="><script>alert(1)</script>';
    const mail = buildPasswordResetEmail({
      resetUrl: hostile,
      expiresInMinutes: 60,
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("tells the recipient that ignoring it is safe", () => {
    const mail = buildPasswordResetEmail({ resetUrl, expiresInMinutes: 60 });

    expect(mail.text.toLowerCase()).toContain("did not request");
  });
});
