import React from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Eye,
  Globe,
  Lock,
  Pencil,
} from "lucide-react";
import * as api from "../../api";
import { PlayfulSelect } from "../PlayfulSelect";
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
  <section className="border-t-2 border-slate-100 pt-4 dark:border-neutral-800">
    <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500">
      Link access
    </h3>
    <div className="flex items-center gap-3">
      <div
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 transition-colors",
          activeLink
            ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-slate-200 bg-slate-100 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
        )}
      >
        {activeLink ? <Globe size={17} /> : <Lock size={17} />}
      </div>
      <PlayfulSelect
        ariaLabel="Link access"
        value={activeLink ? "anyone" : "restricted"}
        onChange={(value) => {
          if (value === "anyone") void handleUpdateLink();
          else void handleRevokeLink();
        }}
        options={[
          { label: "Restricted", value: "restricted", icon: <Lock size={14} /> },
          {
            label: "Anyone with the link",
            value: "anyone",
            icon: <Globe size={14} />,
          },
        ]}
        variant="plain"
        showCheck={false}
      />
    </div>
    <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-neutral-400">
      {activeLink
        ? "Anyone on the internet with the link can open it."
        : "Only people with access can open it."}
    </p>

    {activeLink && (
      <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="flex flex-wrap items-center gap-2">
          <PlayfulSelect
            ariaLabel="Link permission"
            value={linkPermission}
            onChange={(value) => handleUpdateLink(value as "view" | "edit")}
            options={[
              { label: "Viewer", value: "view", icon: <Eye size={14} /> },
              { label: "Editor", value: "edit", icon: <Pencil size={14} /> },
            ]}
            size="sm"
            variant="plain"
          />
          <PlayfulSelect
            ariaLabel="Link expiry"
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
            size="sm"
            variant="plain"
            buttonClassName="pr-2"
          />
        </div>

        <p className="text-[11px] font-medium text-slate-400 dark:text-neutral-500">
          {formatAutoDisableText(activeLink.expiresAt)}
        </p>

        {expiryOption === "custom" && (
          <input
            type="datetime-local"
            value={customExpiry}
            onChange={(event) => setCustomExpiry(event.target.value)}
            onBlur={() => void handleUpdateLink()}
            className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-medium transition-colors focus:border-indigo-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
          />
        )}

        {linkPermission === "edit" && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              Edit access via link is sensitive — anyone with the link can
              change the drawing.
            </p>
          </div>
        )}
      </div>
    )}
  </section>
);
