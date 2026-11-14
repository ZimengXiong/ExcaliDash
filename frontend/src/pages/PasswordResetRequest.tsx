import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { authPasswordResetCapability, authPasswordResetRequest } from "../api";
import { useLocale } from "../context/useLocale";

export const PasswordResetRequest: React.FC = () => {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    authPasswordResetCapability()
      .then((available) => {
        if (active) setEnabled(available);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authPasswordResetRequest(email);
      setSubmitted(true);
    } catch {
      setError(t("auth.resetRequest.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="auth-heading">
            {enabled
              ? t("auth.mustReset.title")
              : t("auth.resetRequest.helpTitle")}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {enabled
              ? t("auth.resetRequest.subtitle")
              : enabled === null
                ? t("auth.resetRequest.checking")
                : t("auth.resetRequest.unavailable")}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {enabled && !submitted ? (
            <form className="ui-card p-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="sr-only" htmlFor="reset-email">
                  {t("auth.emailAddress")}
                </label>
                <input
                  id="reset-email"
                  className="ui-input"
                  type="email"
                  placeholder={t("auth.emailAddress")}
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              ) : null}
              <button
                className="ui-button ui-button-primary w-full"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? t("auth.resetRequest.sending")
                  : t("auth.resetRequest.submit")}
              </button>
            </form>
          ) : enabled && submitted ? (
            <div className="ui-card p-5 text-sm text-gray-700 dark:text-gray-200">
              {t("auth.resetRequest.sent")}
            </div>
          ) : enabled === false ? (
            <div className="ui-card p-5 text-left space-y-3">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                {t("auth.resetRequest.askAdmin")}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {t("auth.resetRequest.adminLockedOut")}
              </div>
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 overflow-x-auto">
                cd backend && node scripts/admin-recover.cjs --identifier
                you@example.com --generate --activate --disable-login-rate-limit
              </pre>
            </div>
          ) : null}

          <div className="text-center">
            <Link to="/login" className="ui-link">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
