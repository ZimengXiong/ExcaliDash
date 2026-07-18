import React from "react";
import clsx from "clsx";
import { AlertTriangle, Calendar, Globe, Lock, Shield } from "lucide-react";
import * as api from "../../api";
import { CustomSelect } from "./CustomSelect";
import {
  EXPIRY_OPTIONS_FOR_EDIT,
  calculateExpiresAt,
  EXPIRY_OPTIONS,
  formatAutoDisableText,
} from "./shareUtils";

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
  <section className="pt-5 border-t border-slate-200 dark:border-neutral-800">
    <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100 mb-3">
      General access
    </h3>
    <div className="flex items-start gap-3">
      <div
        className={clsx(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all",
          activeLink
            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
            : "bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400",
        )}
      >
        {activeLink ? (
          <Globe size={18} strokeWidth={3} />
        ) : (
          <Lock size={18} strokeWidth={3} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0">
        <div className="flex items-center gap-1">
          <CustomSelect
            value={activeLink ? "anyone" : "restricted"}
            onChange={(value) => {
              if (value === "anyone") void handleUpdateLink();
              else void handleRevokeLink();
            }}
            options={[
              { label: "Restricted", value: "restricted" },
              { label: "Anyone with the link", value: "anyone" },
            ]}
            className="-ml-2.5"
            showCheck={false}
          />
        </div>

        <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
          {activeLink
            ? "Anyone on the internet with the link can access."
            : "Only people with access can open with the link."}
        </p>

        {activeLink && (
          <div className="pt-3.5 space-y-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[9px] font-black text-slate-500 dark:text-neutral-400 px-0.5">
              {formatAutoDisableText(activeLink.expiresAt)} When it disables,
              General access switches back to Restricted.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CustomSelect
                value={linkPermission}
                onChange={(value) => handleUpdateLink(value as any)}
                options={[
                  { label: "Viewer", value: "view" },
                  { label: "Editor", value: "edit" },
                ]}
                icon={
                  <Shield
                    size={12}
                    strokeWidth={2.5}
                    className="text-slate-400"
                  />
                }
                variant="bordered"
              />

              <CustomSelect
                value={expiryOption}
                onChange={(value) => {
                  setExpiryOption(value);
                  if (value !== "custom")
                    void handleUpdateLink(undefined, calculateExpiresAt(value));
                }}
                options={
                  linkPermission === "edit"
                    ? EXPIRY_OPTIONS_FOR_EDIT
                    : EXPIRY_OPTIONS
                }
                icon={
                  <Calendar
                    size={12}
                    strokeWidth={2.5}
                    className="text-slate-400"
                  />
                }
                variant="bordered"
              />
            </div>

            {expiryOption === "custom" && (
              <input
                type="datetime-local"
                value={customExpiry}
                onChange={(event) => setCustomExpiry(event.target.value)}
                onBlur={() => void handleUpdateLink()}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
            )}

            {linkPermission === "edit" && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-300 dark:border-amber-700/70 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={14}
                    strokeWidth={3}
                    className="text-amber-600 shrink-0 mt-0.5"
                  />
                  <div className="text-xs text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
                    <span className="uppercase tracking-[0.1em] text-[9px] font-semibold">
                      Security Warning
                    </span>
                    <br />
                    Edit access via link is sensitive.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </section>
);
