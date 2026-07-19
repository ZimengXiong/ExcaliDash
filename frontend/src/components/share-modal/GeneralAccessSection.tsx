import React, { useEffect, useRef, useState } from "react";
import {
  Eye,
  Globe,
  Lock,
  Pencil,
  Clock,
  ChevronDown,
  Check,
} from "lucide-react";
import * as api from "../../api";
import { PlayfulSelect } from "../PlayfulSelect";
import {
  EXPIRY_OPTIONS_FOR_EDIT,
  calculateExpiresAt,
  EXPIRY_OPTIONS,
  formatAutoDisableText,
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
        !containerRef.current.contains(event.target as Node)
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

  const options =
    linkPermission === "edit" ? EXPIRY_OPTIONS_FOR_EDIT : EXPIRY_OPTIONS;

  let buttonLabel = "Never";
  if (expiryOption === "custom" && customExpiry) {
    const ts = Date.parse(customExpiry);
    if (Number.isFinite(ts)) {
      buttonLabel = new Date(ts).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      buttonLabel = "Custom";
    }
  } else {
    const currentOpt = options.find((o) => o.value === expiryOption);
    buttonLabel = currentOpt
      ? currentOpt.label
          .replace("Disable in ", "")
          .replace("Never auto-disable", "Never")
          .replace("Disable at...", "Custom")
      : "Never";
  }

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 rounded-xl border-2 font-semibold transition-all px-2.5 py-1 text-xs outline-none",
          "border-slate-800 bg-white text-slate-700 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-[2.5px_2.5px_0px_0px_rgba(30,41,59,0.9)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)] dark:hover:bg-indigo-900/30 dark:hover:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,0.18)]",
          open && "bg-indigo-50 dark:bg-indigo-900/30",
        )}
      >
        <Clock
          size={13}
          className="shrink-0 text-indigo-600 dark:text-indigo-400"
        />
        <span className="min-w-0 truncate text-left">
          Expires: {buttonLabel}
        </span>
        <ChevronDown
          size={13}
          className={clsx(
            "shrink-0 text-slate-400 transition-transform dark:text-neutral-500",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="ui-menu absolute right-0 top-full mt-2 z-[200] w-60 animate-in fade-in zoom-in-95 duration-100 flex flex-col p-1.5 gap-0.5">
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
              <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider pl-0.5">
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
      )}
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
    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
      General access
    </h3>

    <div className="flex items-center gap-3">
      {/* Circle Icon Badge */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-slate-800 transition-colors ${
          activeLink
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
            : "bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-neutral-400"
        }`}
      >
        {activeLink ? <Globe size={18} /> : <Lock size={18} />}
      </div>

      {/* Middle & Right Settings Block */}
      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
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
            buttonClassName="py-1 px-2.5 text-xs font-semibold"
          />

          <div className="mt-1 text-xs text-slate-400 dark:text-neutral-500">
            <span>
              {activeLink
                ? linkPermission === "edit"
                  ? "Anyone on the internet with the link can edit"
                  : "Anyone on the internet with the link can view"
                : "Only people with access can open with the link"}
            </span>

            {activeLink && activeLink.expiresAt && (
              <>
                <span className="mx-1.5 text-slate-300 dark:text-neutral-700 select-none">
                  ·
                </span>
                <span>{formatAutoDisableText(activeLink.expiresAt)}</span>
              </>
            )}
          </div>
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
              className="w-28"
              buttonClassName="w-full justify-between py-1 px-2.5 text-xs font-semibold"
            />
          </div>
        )}
      </div>
    </div>
  </section>
);
