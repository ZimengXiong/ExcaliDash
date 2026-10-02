export type PasswordResetMailInput = {
  resetUrl: string;
  expiresInMinutes: number;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildPasswordResetEmail = ({
  resetUrl,
  expiresInMinutes,
}: PasswordResetMailInput) => {
  const safeUrl = escapeHtml(resetUrl);
  const text = [
    "Reset your ExcaliDash password",
    "",
    "Open this link to choose a new password:",
    resetUrl,
    "",
    `The link is valid for ${expiresInMinutes} minutes and can be used once.`,
    "If you did not request this, you can ignore this email. Your password stays unchanged.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1e1e1e">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
      <h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
      <p style="margin:0 0 24px;line-height:1.5">Open the link below to choose a new password for your ExcaliDash account.</p>
      <p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#1e1e1e;color:#fff;text-decoration:none;border-radius:6px">Choose a new password</a></p>
      <p style="margin:0 0 24px;line-height:1.5;font-size:14px;color:#868e96">The link is valid for ${expiresInMinutes} minutes and can be used once. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${safeUrl}</span></p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#868e96">If you did not request this, you can ignore this email. Your password stays unchanged.</p>
    </div>
  </body>
</html>`;
  return { subject: "Reset your ExcaliDash password", text, html };
};
