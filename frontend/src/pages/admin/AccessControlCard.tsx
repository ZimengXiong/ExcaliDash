import React from 'react';
import { UserPlus } from 'lucide-react';

type AccessControlCardProps = {
  registrationEnabled: boolean | null;
  localRegistrationAllowed: boolean;
  oidcEnabled: boolean;
  oidcProviderName: string | null;
  oidcJitProvisioningEnabled: boolean | null;
  loading: boolean;
  onToggleRegistration: () => void | Promise<void>;
  onToggleOidcJitProvisioning: () => void | Promise<void>;
};

const getRegistrationSummary = (
  registrationEnabled: boolean | null,
  localRegistrationAllowed: boolean
) => {
  if (registrationEnabled === null) return 'Loading…';
  if (!localRegistrationAllowed) return 'Local self-sign-up is managed by OIDC-only mode.';
  return registrationEnabled
    ? 'New users can create local accounts.'
    : 'Local self-sign-up is disabled.';
};

const getRegistrationLabel = (
  registrationEnabled: boolean | null,
  localRegistrationAllowed: boolean,
  loading: boolean
) => {
  if (registrationEnabled === null) return 'Loading…';
  if (!localRegistrationAllowed) return 'Managed by OIDC';
  if (loading) return 'Saving…';
  return registrationEnabled ? 'Enabled' : 'Disabled';
};

const getRegistrationButtonClassName = (
  registrationEnabled: boolean | null,
  localRegistrationAllowed: boolean
) =>
  `w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
    !localRegistrationAllowed
      ? 'border-slate-200 dark:border-neutral-700 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400'
      : registrationEnabled
        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
        : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
  }`;

const getOidcLabel = (enabled: boolean | null, loading: boolean) => {
  if (enabled === null) return 'Loading…';
  if (loading) return 'Saving…';
  return enabled ? 'Enabled' : 'Invite-only';
};

export const AccessControlCard: React.FC<AccessControlCardProps> = ({
  registrationEnabled,
  localRegistrationAllowed,
  oidcEnabled,
  oidcProviderName,
  oidcJitProvisioningEnabled,
  loading,
  onToggleRegistration,
  onToggleOidcJitProvisioning,
}) => (
  <div className="mb-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 bg-emerald-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-emerald-100 dark:border-neutral-700">
        <UserPlus size={24} className="text-emerald-700 dark:text-emerald-300" />
      </div>
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Access Control</h2>
        <p className="text-sm text-slate-600 dark:text-neutral-400 font-medium">
          {getRegistrationSummary(registrationEnabled, localRegistrationAllowed)}
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Local self-sign-up
        </label>
        <button
          type="button"
          onClick={() => void onToggleRegistration()}
          disabled={loading || registrationEnabled === null || !localRegistrationAllowed}
          className={getRegistrationButtonClassName(
            registrationEnabled,
            localRegistrationAllowed
          )}
        >
          {getRegistrationLabel(registrationEnabled, localRegistrationAllowed, loading)}
        </button>
      </div>
      {oidcEnabled && (
        <div>
          <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
            {oidcProviderName || 'OIDC'} auto-provisioning
          </label>
          <button
            type="button"
            onClick={() => void onToggleOidcJitProvisioning()}
            disabled={loading || oidcJitProvisioningEnabled === null}
            className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
              oidcJitProvisioningEnabled
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
            }`}
          >
            {getOidcLabel(oidcJitProvisioningEnabled, loading)}
          </button>
        </div>
      )}
    </div>

    {oidcEnabled && oidcJitProvisioningEnabled !== null && (
      <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-4 text-sm text-blue-900 dark:text-blue-100">
        <div className="font-semibold">
          {oidcProviderName || 'OIDC'} access:{' '}
          {oidcJitProvisioningEnabled ? 'Auto-provisioning enabled' : 'Invite-only'}
        </div>
        <div className="mt-1">
          {oidcJitProvisioningEnabled
            ? 'Any successfully authenticated OIDC user can get an account on first sign-in.'
            : 'Only users pre-created below can sign in through OIDC. Use OIDC-only invites for accounts that should not have a local password.'}
        </div>
      </div>
    )}
  </div>
);
