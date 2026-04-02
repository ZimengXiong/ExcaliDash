import React from 'react';

type AuthStatusErrorPanelProps = {
  message: string;
  onRetry: () => void | Promise<void>;
  fullScreen?: boolean;
};

export const AuthStatusErrorPanel: React.FC<AuthStatusErrorPanelProps> = ({
  message,
  onRetry,
  fullScreen = false,
}) => {
  const panel = (
    <div className="max-w-lg rounded-md bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
      <div>{message}</div>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-3 rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-red-900 hover:bg-white dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/70"
      >
        Retry connection
      </button>
    </div>
  );

  if (!fullScreen) {
    return panel;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      {panel}
    </div>
  );
};
