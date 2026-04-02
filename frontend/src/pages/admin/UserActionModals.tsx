import React from 'react';
import { ConfirmModal } from '../../components/ConfirmModal';
import type { AdminUser } from './types';

type PasswordResult = {
  email: string;
  tempPassword: string;
};

type UserActionModalsProps = {
  impersonateTarget: AdminUser | null;
  resetPasswordResult: PasswordResult | null;
  onConfirmImpersonation: (user: AdminUser) => void | Promise<void>;
  onCancelImpersonation: () => void;
  onCopyPassword: (result: PasswordResult) => void | Promise<void>;
  onClosePassword: () => void;
};

export const UserActionModals: React.FC<UserActionModalsProps> = ({
  impersonateTarget,
  resetPasswordResult,
  onConfirmImpersonation,
  onCancelImpersonation,
  onCopyPassword,
  onClosePassword,
}) => (
  <>
    <ConfirmModal
      isOpen={Boolean(impersonateTarget)}
      title="Start impersonation?"
      message={
        impersonateTarget
          ? `You will act as ${impersonateTarget.email} until you stop impersonation. Continue?`
          : ''
      }
      confirmText="Impersonate"
      onConfirm={() => {
        if (impersonateTarget) {
          void onConfirmImpersonation(impersonateTarget);
        }
        onCancelImpersonation();
      }}
      onCancel={onCancelImpersonation}
    />

    <ConfirmModal
      isOpen={Boolean(resetPasswordResult)}
      title="Temporary password"
      message={
        resetPasswordResult ? (
          <div className="space-y-3">
            <div className="text-xs">
              Temporary password for{' '}
              <span className="font-bold text-slate-900 dark:text-neutral-100">
                {resetPasswordResult.email}
              </span>
              . They will be prompted to set a new password after signing in.
            </div>
            <div className="px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-sm text-slate-900 dark:text-neutral-100 break-all">
              {resetPasswordResult.tempPassword}
            </div>
          </div>
        ) : (
          ''
        )
      }
      confirmText="Copy"
      cancelText="Close"
      isDangerous={false}
      variant="success"
      onConfirm={() => {
        if (!resetPasswordResult) return;
        void onCopyPassword(resetPasswordResult);
        onClosePassword();
      }}
      onCancel={onClosePassword}
    />
  </>
);
