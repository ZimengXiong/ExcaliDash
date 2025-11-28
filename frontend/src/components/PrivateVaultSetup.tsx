import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { validatePasswordStrength } from '../utils/crypto';

interface PrivateVaultSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSetup: (password: string, hint?: string) => Promise<void>;
}

export const PrivateVaultSetup: React.FC<PrivateVaultSetupProps> = ({
  isOpen,
  onClose,
  onSetup,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hint, setHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordStrength = validatePasswordStrength(password);
  const passwordsMatch = password === confirmPassword;
  const canSubmit = passwordStrength.isValid && passwordsMatch && password.length > 0;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      await onSetup(password, hint || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setHint('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)] w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
              <Lock size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Set Up Private Vault</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">Protect your drawings with a password</p>
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

          {/* Password */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            {/* Strength Indicator */}
            {password.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i <= passwordStrength.score ? getStrengthColor(passwordStrength.score) : 'bg-slate-200 dark:bg-neutral-700'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${
                  passwordStrength.score <= 1 ? 'text-red-600 dark:text-red-400' :
                  passwordStrength.score === 2 ? 'text-orange-600 dark:text-orange-400' :
                  passwordStrength.score === 3 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                }`}>
                  {getStrengthText(passwordStrength.score)}
                </p>
                {passwordStrength.feedback.length > 0 && (
                  <ul className="text-xs text-slate-500 dark:text-neutral-400 space-y-1">
                    {passwordStrength.feedback.map((feedback, i) => (
                      <li key={i}>• {feedback}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className={`w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-800 border-2 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  confirmPassword.length > 0 && !passwordsMatch 
                    ? 'border-red-500' 
                    : 'border-black dark:border-neutral-700'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <div className="flex items-center gap-1">
                {passwordsMatch ? (
                  <>
                    <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
                    <span className="text-xs text-green-600 dark:text-green-400">Passwords match</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} className="text-red-600 dark:text-red-400" />
                    <span className="text-xs text-red-600 dark:text-red-400">Passwords do not match</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Password Hint (Optional) */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300">
              Password Hint <span className="font-normal text-slate-400 dark:text-neutral-500">(optional)</span>
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="A hint to help you remember"
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Warning */}
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Important:</strong> There is no way to recover your password. If you forget it, 
              all private drawings will be permanently inaccessible.
            </p>
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
              {isLoading ? 'Setting up...' : 'Set Up Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
