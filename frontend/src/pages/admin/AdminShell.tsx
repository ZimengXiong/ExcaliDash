import React from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { displayFontFamily } from "../../utils/displayFont";

type AdminHeaderProps = {
  loadingUsers: boolean;
  showUserActions?: boolean;
  onRefreshUsers: () => void;
  onToggleCreateUser: () => void;
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  loadingUsers,
  showUserActions = true,
  onRefreshUsers,
  onToggleCreateUser,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 sm:mb-8 min-w-0">
    <div className="min-w-0">
      <h1
        className="text-3xl sm:text-5xl text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        Admin
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400 font-medium">
        {showUserActions
          ? "Manage users and access controls"
          : "Review this single-user deployment"}
      </p>
    </div>
    {showUserActions ? (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onRefreshUsers}
          disabled={loadingUsers}
          className="ui-button-secondary px-4"
        >
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          onClick={onToggleCreateUser}
          className="ui-button-primary px-4"
        >
          <UserPlus size={16} /> New user
        </button>
      </div>
    ) : null}
  </div>
);

type AdminStatusMessagesProps = {
  success: string;
  error: string;
};

export const AdminStatusMessages: React.FC<AdminStatusMessagesProps> = ({
  success,
  error,
}) => (
  <>
    {success && (
      <div className="mb-4 p-3.5 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
        <p className="text-green-800 dark:text-green-200 font-medium">
          {success}
        </p>
      </div>
    )}
    {error && (
      <div className="mb-4 p-3.5 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
        <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
      </div>
    )}
  </>
);
