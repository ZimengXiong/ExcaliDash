import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import * as api from "../../api";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { getPasswordPolicy, validatePassword } from "../../utils/passwordPolicy";
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionHeader,
  settingsButtonClass,
  settingsSelectClass,
} from "../settings/SettingsRow";

const roseButtonClass =
  "rounded-lg border-2 border-slate-800 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50 dark:border-neutral-600 dark:bg-rose-500 dark:hover:bg-rose-400";

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
      onError("All password fields are required");
      return;
    }

    const passwordError = validatePassword(newPassword, passwordPolicy);
    if (passwordError) {
      onError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      onError("New passwords do not match");
      return;
    }

    setLoading(true);
    onError("");
    onSuccess("");
    try {
      await api.api.post("/auth/change-password", { currentPassword, newPassword });
      onSuccess("Password changed successfully");
      resetForm();
      setTimeout(() => {
        logout();
        navigate("/login");
      }, 2000);
    } catch (err: unknown) {
      let message = "Failed to change password";
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message ?? err.response?.data?.error ?? message;
      }
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  const fieldLabelClass =
    "mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400";

  return (
    <section>
      <SettingsSectionHeader
        icon={<Lock size={20} />}
        tileClassName="border-black bg-rose-400 text-black dark:border-neutral-700 dark:bg-rose-400 dark:text-black"
        title="Password"
        subtitle="Keep your account secure"
      />

      <SettingsCard>
        {!showPasswordForm ? (
          <SettingsRow
            title="Change password"
            description="You will be signed out afterwards"
          >
            <button
              onClick={() => setShowPasswordForm(true)}
              className={roseButtonClass}
            >
              Change password
            </button>
          </SettingsRow>
        ) : (
          <div className="max-w-md space-y-3 px-4 py-3.5 sm:px-5">
            <div>
              <label htmlFor="currentPassword" className={fieldLabelClass}>
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={`${settingsSelectClass} w-full`}
                placeholder="Enter current password"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className={fieldLabelClass}>
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                pattern={passwordPolicy.patternHtml}
                className={`${settingsSelectClass} w-full`}
                placeholder="Enter new password"
              />
              <PasswordRequirements
                password={newPassword}
                policy={passwordPolicy}
                className="text-slate-600 dark:text-neutral-400"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={fieldLabelClass}>
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                pattern={passwordPolicy.patternHtml}
                className={`${settingsSelectClass} w-full`}
                placeholder="Confirm new password"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void handleChangePassword()}
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                className={roseButtonClass}
              >
                {loading ? "Changing..." : "Change Password"}
              </button>
              {!mustResetPassword && (
                <button
                  onClick={resetForm}
                  disabled={loading}
                  className={settingsButtonClass}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </SettingsCard>
    </section>
  );
};
