import React, { useEffect, useId, useRef, useState } from "react";
import {
  Shield,
  Settings as SettingsIcon,
  Trash2,
  User,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { UserAvatar } from "../UserAvatar";
import { useLocale } from "../../context/useLocale";
import { usePreference } from "../../context/PreferencesContext";

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

const footerButtonClass = (isActive: boolean, compact: boolean) =>
  clsx(
    compact ? "ui-menu-item" : "ui-button-secondary w-full justify-start",
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
  const { t } = useLocale();
  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const [compact] = usePreference("compactSidebar", true);
  const [isOpen, setIsOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const actionsId = useId();
  const isAdmin = user?.role === "ADMIN";
  const name = user?.name || t("sidebar.workspace");
  const selectPage = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  useEffect(() => {
    if (!compact || !isOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!footerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [compact, isOpen]);

  return (
    <div
      ref={footerRef}
      className="relative shrink-0 px-3 py-3 border-t border-slate-200/50 dark:border-neutral-800"
    >
      {compact && (
        <button
          type="button"
          aria-label={t("sidebar.accountMenu")}
          aria-expanded={isOpen}
          aria-controls={actionsId}
          onClick={() => setIsOpen((open) => !open)}
          onDragEnter={() => setIsOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <UserAvatar name={name} size="sm" />
          <span className="min-w-0 flex-1 truncate text-left">{name}</span>
          <ChevronUp
            size={16}
            className={clsx(
              "shrink-0 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>
      )}
      <div
        id={actionsId}
        hidden={compact && !isOpen}
        className={clsx(
          compact
            ? "ui-menu custom-scrollbar absolute bottom-full left-3 right-3 z-30 mb-2 max-h-[calc(100dvh-7rem)] overflow-y-auto"
            : "mb-3 space-y-2",
        )}
      >
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
          onClick={() => selectPage("/collections?id=trash")}
          className={clsx(
            compact
              ? "ui-menu-item"
              : "ui-button-secondary w-full justify-start",
            selectedCollectionId === "trash" || isTrashDragOver
              ? "bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-300 -translate-y-0.5"
              : "hover:bg-rose-50 hover:text-rose-900 dark:hover:bg-rose-900/30 dark:hover:text-rose-300",
          )}
        >
          <Trash2 size={18} />
          <span className="min-w-0 flex-1 text-left">{t("sidebar.trash")}</span>
        </button>

        {authEnabled !== null && (
          <button
            onClick={() => selectPage("/profile")}
            className={footerButtonClass(
              selectedCollectionId === "PROFILE",
              compact,
            )}
          >
            <User size={18} />
            <span className="min-w-0 flex-1 text-left">
              {t("sidebar.profile")}
            </span>
          </button>
        )}

        {authEnabled !== null && (isAdmin || authEnabled === false) && (
          <button
            onClick={() => selectPage("/admin")}
            className={footerButtonClass(
              selectedCollectionId === "ADMIN",
              compact,
            )}
          >
            <Shield size={18} />
            <span className="min-w-0 flex-1 text-left">
              {t("sidebar.admin")}
            </span>
          </button>
        )}

        <button
          onClick={() => selectPage("/settings")}
          className={footerButtonClass(
            selectedCollectionId === "SETTINGS",
            compact,
          )}
        >
          <SettingsIcon size={18} />
          <span className="min-w-0 flex-1 text-left">
            {t("sidebar.settings")}
          </span>
        </button>

        {authEnabled && (
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-neutral-700">
            <button
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className={clsx(
                compact
                  ? "ui-menu-item"
                  : "ui-button-secondary w-full justify-start",
                "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30",
              )}
            >
              <LogOut size={18} />
              <span className="min-w-0 flex-1 text-left">
                {t("sidebar.logout")}
              </span>
            </button>
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-3 px-2 py-2 text-sm font-semibold text-slate-700 dark:text-neutral-200">
          <UserAvatar name={name} size="sm" />
          <span className="min-w-0 truncate">{name}</span>
        </div>
      )}
    </div>
  );
};
