import React, { useEffect, useState } from "react";
import { PasswordInput } from '../../components/PasswordInput';
import { useNavigate } from "react-router-dom";
import { Lock, X } from "lucide-react";
import * as api from "../../api";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { getPasswordPolicy, validatePassword } from "../../utils/passwordPolicy";

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

  return (
    <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-rose-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-rose-100 dark:border-neutral-700">
            <Lock size={24} className="text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Change Password</h2>
        </div>
        {!showPasswordForm && !mustResetPassword && (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="px-4 py-2 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200"
          >
            Change Password
          </button>
        )}
      </div>

      {showPasswordForm && (
        <div className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
              Current Password
            </label>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
              New Password
            </label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={passwordPolicy.minLength}
              maxLength={passwordPolicy.maxLength}
              pattern={passwordPolicy.patternHtml}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
              placeholder="Enter new password"
            />
            <PasswordRequirements
              password={newPassword}
              policy={passwordPolicy}
              className="text-slate-600 dark:text-neutral-400"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
              Confirm New Password
            </label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={passwordPolicy.minLength}
              maxLength={passwordPolicy.maxLength}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
              placeholder="Confirm new password"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => void handleChangePassword()}
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="flex-1 px-6 py-3 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Changing..." : "Change Password"}
            </button>
            {!mustResetPassword && (
              <button
                onClick={resetForm}
                disabled={loading}
                className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <X size={18} />
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
