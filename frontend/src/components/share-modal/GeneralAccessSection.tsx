import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Globe,
  Lock,
  Pencil,
  Clock,
  Check,
} from "lucide-react";
import * as api from "../../api";
import { PlayfulSelect } from "../PlayfulSelect";
import {
  EXPIRY_OPTIONS_FOR_EDIT,
  calculateExpiresAt,
  EXPIRY_OPTIONS,
} from "./shareUtils";
import clsx from "clsx";

type Props = {
  activeLink: api.DrawingLinkShareRow | null;
  linkPermission: "view" | "edit";
  expiryOption: string;
  customExpiry: string;
  setLinkPermission: (value: "view" | "edit") => void;
  setExpiryOption: (value: string) => void;
  setCustomExpiry: (value: string) => void;
  handleUpdateLink: (
    permission?: "view" | "edit",
    expiresAt?: string | null,
  ) => void | Promise<void>;
  handleRevokeLink: () => void | Promise<void>;
};

export const LinkExpirySelect: React.FC<{
  expiryOption: string;
  customExpiry: string;
  setExpiryOption: (value: string) => void;
  setCustomExpiry: (value: string) => void;
  handleUpdateLink: (
    permission?: "view" | "edit",
    expiresAt?: string | null,
  ) => void | Promise<void>;
  linkPermission: "view" | "edit";
}> = ({
  expiryOption,
  customExpiry,
  setExpiryOption,
  setCustomExpiry,
  handleUpdateLink,
  linkPermission,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [portalPosition, setPortalPosition] = useState<React.CSSProperties>();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If the datetime-local input is currently focused, do not close the menu
      if (
        document.activeElement &&
        document.activeElement.tagName === "INPUT" &&
        (document.activeElement as HTMLInputElement).type === "datetime-local"
      ) {
        return;
      }
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const gap = 8;
      const openUpward =
        menuHeight > 0 &&
        rect.bottom + gap + menuHeight > window.innerHeight &&
        rect.top - gap - menuHeight >= 0;

      setPortalPosition({
        position: "fixed",
        top: openUpward ? rect.top - gap - menuHeight : rect.bottom + gap,
        right: window.innerWidth - rect.right,
        minWidth: "240px",
      });
    };

    updatePosition();
    const r = requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const options =
    linkPermission === "edit" ? EXPIRY_OPTIONS_FOR_EDIT : EXPIRY_OPTIONS;

  const menu = open ? (
    <div
      ref={menuRef}
      role="listbox"
      style={portalPosition}
      className="ui-menu fixed z-[210] w-60 animate-in fade-in zoom-in-95 duration-100 flex flex-col p-1.5 gap-0.5"
    >
      {options.map((option) => {
        const selected = expiryOption === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setExpiryOption(option.value);
              if (option.value !== "custom") {
                void handleUpdateLink(
                  undefined,
                  calculateExpiresAt(option.value),
                );
                setOpen(false);
              }
            }}
            className={clsx(
              "ui-menu-item text-left w-full justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors",
              selected && "ui-menu-item-selected",
            )}
          >
            <span>{option.label}</span>
            {selected && (
              <Check
                size={12}
                strokeWidth={3}
                className="ml-auto shrink-0 text-indigo-600 dark:text-indigo-400"
              />
            )}
          </button>
        );
      })}

      {expiryOption === "custom" && (
        <div className="border-t border-slate-100 dark:border-neutral-800 pt-2 px-1.5 pb-1 mt-1.5 flex flex-col gap-1.5">
          <span className="pl-0.5 text-xs font-semibold text-slate-400 dark:text-neutral-500">
            Custom expiry time
          </span>
          <input
            type="datetime-local"
            value={customExpiry}
            onChange={(event) => setCustomExpiry(event.target.value)}
            onBlur={() => void handleUpdateLink()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full rounded-lg border-2 border-slate-800 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          "ui-icon-button h-[38px] w-[38px]",
          open && "bg-indigo-50 dark:bg-indigo-900/30",
        )}
        title="Set link expiration"
        aria-label="Set link expiration"
      >
        <Clock
          size={14}
          className="text-indigo-600 dark:text-indigo-400"
        />
      </button>

      {menu && createPortal(menu, document.body)}
    </div>
  );
};

export const GeneralAccessSection: React.FC<Props> = ({
  activeLink,
  linkPermission,
  expiryOption,
  customExpiry,
  setExpiryOption,
  setCustomExpiry,
  handleUpdateLink,
  handleRevokeLink,
}) => (
  <section className="border-t-2 border-slate-100 pt-4 dark:border-neutral-800">
    <h3 className="mb-3 text-xs font-semibold text-slate-400 dark:text-neutral-500">
      General access
    </h3>

    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <PlayfulSelect
          ariaLabel="Link access"
          value={activeLink ? "anyone" : "restricted"}
          onChange={(value) => {
            if (value === "anyone") void handleUpdateLink();
            else void handleRevokeLink();
          }}
          options={[
            {
              label: "Restricted",
              value: "restricted",
              icon: <Lock size={14} />,
            },
            {
              label: "Anyone with the link",
              value: "anyone",
              icon: <Globe size={14} />,
            },
          ]}
          variant="playful"
          showCheck={false}
          buttonClassName="py-2 px-3 text-sm font-semibold"
        />
      </div>

      {activeLink && (
        <div className="flex items-center gap-2 shrink-0 animate-in fade-in duration-150">
          <LinkExpirySelect
            expiryOption={expiryOption}
            customExpiry={customExpiry}
            setExpiryOption={setExpiryOption}
            setCustomExpiry={setCustomExpiry}
            handleUpdateLink={handleUpdateLink}
            linkPermission={linkPermission}
          />
          <PlayfulSelect
            ariaLabel="Link permission"
            value={linkPermission}
            onChange={(value) => handleUpdateLink(value as "view" | "edit")}
            options={[
              { label: "Viewer", value: "view", icon: <Eye size={14} /> },
              { label: "Editor", value: "edit", icon: <Pencil size={14} /> },
            ]}
            variant="playful"
            className="w-32"
            buttonClassName="w-full justify-between py-2 px-3 text-sm font-semibold"
          />
        </div>
      )}
    </div>
  </section>
);
