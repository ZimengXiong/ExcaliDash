import React, { useState } from 'react';
import { X, Key, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { validatePasswordStrength } from '../utils/crypto';

interface ChangeVaultPasswordProps {
  isOpen: boolean;
  onClose: () => void;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
}

export const ChangeVaultPassword: React.FC<ChangeVaultPasswordProps> = ({
  isOpen,
  onClose,
  onChangePassword,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = validatePasswordStrength(newPassword);
  const passwordsMatch = confirmPassword === newPassword;
  const canSubmit = oldPassword.length > 0 && newPassword.length > 0 && passwordsMatch && strength.isValid;

  const handleClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      await onChangePassword(oldPassword, newPassword);
      handleClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const getStrengthColor = (score: number) => {
    if (score <= 1) return 'bg-red-500';
    if (score === 2) return 'bg-orange-500';
    if (score === 3) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = (score: number) => {
    if (score <= 1) return 'Weak';
    if (score === 2) return 'Fair';
    if (score === 3) return 'Good';
    return 'Strong';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)] w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
              <Key size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Change Vault Password</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">Update your vault password</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500 dark:text-neutral-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          {/* Old Password */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300">Current Password</label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter your current password"
                autoFocus
                className="w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter your new password"
                className="w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Strength Indicator */}
            {newPassword.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i <= strength.score ? getStrengthColor(strength.score) : 'bg-slate-200 dark:bg-neutral-700'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${
                  strength.score <= 1 ? 'text-red-600 dark:text-red-400' :
                  strength.score === 2 ? 'text-orange-600 dark:text-orange-400' :
                  strength.score === 3 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                }`}>
                  {getStrengthText(strength.score)}
                </p>
                {strength.feedback.length > 0 && (
                  <ul className="text-xs text-slate-500 dark:text-neutral-400 space-y-1">
                    {strength.feedback.map((fb, i) => (
                      <li key={i}>• {fb}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                className={`w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-800 border-2 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  confirmPassword.length > 0 && !passwordsMatch ? 'border-red-500' : 'border-black dark:border-neutral-700'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-slate-100 dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg font-bold text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isLoading}
              className="flex-1 px-4 py-3 bg-indigo-500 border-2 border-black dark:border-indigo-600 rounded-lg font-bold text-white hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(79,70,229,0.5)]"
            >
              {isLoading ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
