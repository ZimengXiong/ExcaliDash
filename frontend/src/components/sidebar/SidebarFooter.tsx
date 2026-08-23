import React, { useState } from "react";
import {
  Shield,
  Settings as SettingsIcon,
  Trash2,
  User,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { UserAvatar } from "../UserAvatar";

type UserLike =
  | {
      name: string;
      email: string;
      role?: string;
    }
  | null
  | undefined;

interface SidebarFooterProps {
  selectedCollectionId: string | null | undefined;
  authEnabled: boolean | null;
  user: UserLike;
  onDrop?: (e: React.DragEvent, collectionId: string | null) => void;
  onLogout: () => void;
}

const footerButtonClass = (isActive: boolean) =>
  clsx(
    "ui-button-secondary w-full justify-start",
    isActive
      ? "bg-indigo-50 text-indigo-900 -translate-y-0.5 dark:bg-neutral-700 dark:text-white"
      : "",
  );

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  selectedCollectionId,
  authEnabled,
  user,
  onDrop,
  onLogout,
}) => {
  const navigate = useNavigate();
  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="px-3 pt-3 sm:pt-4 pb-3 sm:pb-4 border-t border-slate-200/50 dark:border-slate-700/50 space-y-2">
      <button
        onDragOver={(e) => {
          e.preventDefault();
          setIsTrashDragOver(true);
        }}
        onDragLeave={() => setIsTrashDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsTrashDragOver(false);
          onDrop?.(e, "trash");
        }}
        onClick={() => navigate("/collections?id=trash")}
        className={clsx(
          "ui-button-secondary w-full justify-start",
          selectedCollectionId === "trash" || isTrashDragOver
            ? "bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-300 -translate-y-0.5"
            : "hover:bg-rose-50 hover:text-rose-900 dark:hover:bg-rose-900/30 dark:hover:text-rose-300",
        )}
      >
        <Trash2 size={18} />
        <span className="min-w-0 flex-1 text-left">Trash</span>
      </button>

      {authEnabled !== null && (
        <button
          onClick={() => navigate("/profile")}
          className={footerButtonClass(selectedCollectionId === "PROFILE")}
        >
          <User size={18} />
          <span className="min-w-0 flex-1 text-left">Profile</span>
        </button>
      )}

      {authEnabled !== null && (isAdmin || authEnabled === false) && (
        <button
          onClick={() => navigate("/admin")}
          className={footerButtonClass(selectedCollectionId === "ADMIN")}
        >
          <Shield size={18} />
          <span className="min-w-0 flex-1 text-left">Admin</span>
        </button>
      )}

      <button
        onClick={() => navigate("/settings")}
        className={footerButtonClass(selectedCollectionId === "SETTINGS")}
      >
        <SettingsIcon size={18} />
        <span className="min-w-0 flex-1 text-left">Settings</span>
      </button>

      {authEnabled && (
        <div className="mt-auto pt-4 border-t-2 border-slate-200 dark:border-neutral-700">
          {user && (
            <div className="py-2 text-xs text-slate-500 dark:text-neutral-500 mb-2">
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <UserAvatar name={user.name} size="sm" className="ml-1" />
                <div className="min-w-0 text-left">
                  <div className="font-semibold text-slate-700 dark:text-neutral-300 truncate leading-tight">
                    {user.name}
                  </div>
                  <div className="truncate leading-tight">{user.email}</div>
                </div>
                <div
                  className="w-7 h-7 sm:w-8 sm:h-8 invisible"
                  aria-hidden="true"
                />
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            className="ui-button-secondary w-full justify-start text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut size={18} />
            <span className="min-w-0 flex-1 text-left">Logout</span>
          </button>
        </div>
      )}
    </div>
  );
};
