import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
  showCancel?: boolean;
  variant?: 'warning' | 'success';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDangerous = true,
  showCancel = true,
  variant = 'warning'
}) => {
  if (!isOpen) return null;

  const isSuccess = variant === 'success';
  const IconComponent = isSuccess ? CheckCircle : AlertTriangle;
  const iconClasses = isSuccess 
    ? "w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-300 border-2 border-emerald-200 dark:border-emerald-900/30"
    : "w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-300 border-2 border-rose-200 dark:border-rose-900/30";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl border-2 border-slate-800 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.18)] p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onCancel}
          className="ui-icon-button absolute right-4 top-4 h-8 w-8 border-transparent bg-transparent shadow-none dark:bg-transparent"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className={iconClasses}>
            <IconComponent size={24} strokeWidth={2.5} />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">{title}</h3>
            <div className="text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {message}
            </div>
          </div>

          <div className="flex gap-3 w-full mt-2">
            {showCancel && (
              <button
                onClick={onCancel}
                className="ui-button-secondary flex-1 px-4 py-2.5"
              >
                {cancelText}
              </button>
            )}

            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 ${isDangerous
                ? 'ui-button-danger'
                : 'ui-button-primary'
                }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
