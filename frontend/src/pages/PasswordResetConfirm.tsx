import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { authPasswordResetConfirm, isAxiosError } from "../api";
import { getPasswordPolicy, validatePassword } from "../utils/passwordPolicy";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { PasswordInput } from "../components/PasswordInput";
import { PasswordMatch } from "../components/PasswordMatch";
import { useLocale } from "../context/useLocale";

export const PasswordResetConfirm: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  const token = useMemo(() => {
    const fragmentParams = new URLSearchParams(location.hash.replace(/^#/, ""));
    return (
      fragmentParams.get("token") ??
      new URLSearchParams(location.search).get("token")
    );
  }, [location.hash, location.search]);

  useLayoutEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const fragmentParams = new URLSearchParams(location.hash.replace(/^#/, ""));
    const hadToken = searchParams.has("token") || fragmentParams.has("token");
    if (!hadToken) return;
    searchParams.delete("token");
    fragmentParams.delete("token");

    const safeSearch = searchParams.toString();
    const safeFragment = fragmentParams.toString();
    const safeUrl = `${location.pathname}${safeSearch ? `?${safeSearch}` : ""}${safeFragment ? `#${safeFragment}` : ""}`;
    window.history.replaceState(window.history.state, "", safeUrl);
  }, [location.hash, location.pathname, location.search]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const passwordPolicy = getPasswordPolicy();

  useEffect(() => {
    if (!token) {
      setError(t("auth.resetConfirm.invalidLink"));
    }
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("password.mismatch"));
      return;
    }

    const passwordError = validatePassword(password, passwordPolicy);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!token) {
      setError(t("auth.resetConfirm.invalidToken"));
      return;
    }

    setLoading(true);

    try {
      await authPasswordResetConfirm(token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err: unknown) {
      let message = t("auth.mustReset.failed");
      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          message = t("auth.resetConfirm.notEnabled");
        } else if (err.response?.data?.message) {
          message = err.response.data.message;
        } else if (err.response?.data?.error) {
          message = err.response.data.error;
        } else if (err.message) {
          message = err.message;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-wrap">
          <div className="text-center">
            <Logo className="mx-auto h-12 w-auto" />
            <h2 className="auth-heading">
              {t("auth.resetConfirm.successTitle")}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t("auth.resetConfirm.successMessage")}
            </p>
            <div className="mt-6">
              <Link to="/login" className="ui-link">
                {t("auth.goToLogin")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="auth-heading">{t("auth.mustReset.submit")}</h2>
        </div>
        <form className="auth-panel" onSubmit={handleSubmit}>
          {error && (
            <div className="ui-alert-error">
              <div>{error}</div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="sr-only">
                {t("password.newPassword")}
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                pattern={passwordPolicy.patternHtml}
                className="ui-input block w-full"
                placeholder={t("password.newPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordRequirements
                password={password}
                policy={passwordPolicy}
                className="text-gray-600 dark:text-gray-400"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                {t("password.confirmPassword")}
              </label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                className="ui-input block w-full"
                placeholder={t("password.confirmPassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <PasswordMatch
                password={password}
                confirmPassword={confirmPassword}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !token}
              className="ui-button-primary w-full"
            >
              {loading
                ? t("auth.resetConfirm.resetting")
                : t("auth.resetConfirm.submit")}
            </button>
          </div>

          <div className="text-center">
            <Link to="/login" className="ui-link">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
