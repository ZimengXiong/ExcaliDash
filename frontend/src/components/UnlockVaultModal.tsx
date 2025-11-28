import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff, AlertCircle, HelpCircle } from 'lucide-react';

interface UnlockVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (password: string) => Promise<boolean>;
  passwordHint?: string | null;
}

export const UnlockVaultModal: React.FC<UnlockVaultModalProps> = ({
  isOpen,
  onClose,
  onUnlock,
  passwordHint,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError(null);

    try {
      const success = await onUnlock(password);
      if (success) {
        setPassword('');
        onClose();
      } else {
        setError('Incorrect password');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError(null);
    setShowHint(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)] w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
              <Lock size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Unlock Vault</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">Enter your password</p>
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
                autoFocus
                className="w-full px-4 py-3 pr-12 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Password Hint */}
          {passwordHint && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300 transition-colors"
              >
                <HelpCircle size={14} />
                <span>{showHint ? 'Hide hint' : 'Show password hint'}</span>
              </button>
              {showHint && (
                <div className="p-3 bg-slate-100 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-neutral-300">{passwordHint}</p>
                </div>
              )}
            </div>
          )}

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
              disabled={!password || isLoading}
              className="flex-1 px-4 py-3 bg-amber-500 border-2 border-black dark:border-amber-600 rounded-lg font-bold text-white hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(245,158,11,0.5)]"
            >
              {isLoading ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
