import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { PasswordInput } from "../../components/PasswordInput";
import { PasswordMatch } from "../../components/PasswordMatch";
import {
  getPasswordPolicy,
  validatePassword,
} from "../../utils/passwordPolicy";
import {
  SettingsCard,
  SettingsRow,
  settingsButtonClass,
  settingsSelectClass,
} from "../settings/SettingsRow";
import { useLocale } from "../../context/useLocale";

const roseButtonClass = "ui-button-danger";

type Props = {
  mustResetPassword: boolean;
  logout: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export const PasswordCard: React.FC<Props> = ({
  mustResetPassword,
  logout,
  onError,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const { t } = useLocale();
  const passwordPolicy = getPasswordPolicy();
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  useEffect(() => {
    if (mustResetPassword) setShowPasswordForm(true);
  }, [mustResetPassword]);

  const resetForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    onError("");
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      onError(t("password.errors.allRequired"));
      return;
    }

    const passwordError = validatePassword(newPassword, passwordPolicy);
    if (passwordError) {
      onError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      onError(t("password.newPasswordsMismatch"));
      return;
    }

    setLoading(true);
    onError("");
    onSuccess("");
    try {
      await api.api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      onSuccess(t("password.changed"));
      resetForm();
      setTimeout(() => {
        logout();
        navigate("/login");
      }, 2000);
    } catch (err: unknown) {
      let message = t("password.errors.changeFailed");
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message ?? err.response?.data?.error ?? message;
      }
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  const fieldLabelClass =
    "mb-1 block text-xs font-semibold text-slate-500 dark:text-neutral-400";

  return (
    <section aria-label={t("password.change")}>
      <SettingsCard>
        {!showPasswordForm ? (
          <SettingsRow
            title={t("password.change")}
            description={t("password.signedOutAfterwards")}
          >
            <button
              onClick={() => setShowPasswordForm(true)}
              className={roseButtonClass}
            >
              {t("password.change")}
            </button>
          </SettingsRow>
        ) : (
          <div className="max-w-md space-y-3 px-4 py-3.5 sm:px-5">
            <div>
              <label htmlFor="currentPassword" className={fieldLabelClass}>
                {t("password.currentPassword")}
              </label>
              <PasswordInput
                id="currentPassword"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={`${settingsSelectClass} w-full`}
                placeholder={t("password.enterCurrent")}
              />
            </div>

            <div>
              <label htmlFor="newPassword" className={fieldLabelClass}>
                {t("password.newPassword")}
              </label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                pattern={passwordPolicy.patternHtml}
                className={`${settingsSelectClass} w-full`}
                placeholder={t("password.enterNew")}
              />
              <PasswordRequirements
                password={newPassword}
                policy={passwordPolicy}
                className="text-slate-600 dark:text-neutral-400"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={fieldLabelClass}>
                {t("password.confirmNewPassword")}
              </label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                pattern={passwordPolicy.patternHtml}
                className={`${settingsSelectClass} w-full`}
                placeholder={t("password.confirmNewPassword")}
              />
              <PasswordMatch
                password={newPassword}
                confirmPassword={confirmPassword}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void handleChangePassword()}
                disabled={
                  loading ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
                className={roseButtonClass}
              >
                {loading ? t("password.changing") : t("password.change")}
              </button>
              {!mustResetPassword && (
                <button
                  onClick={resetForm}
                  disabled={loading}
                  className={settingsButtonClass}
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>
          </div>
        )}
      </SettingsCard>
    </section>
  );
};
