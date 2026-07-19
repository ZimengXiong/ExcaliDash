import React from "react";
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
    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
      Link access
    </h3>
    <div className="flex items-center gap-3">
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400 dark:text-neutral-500">Role:</span>
            <PlayfulSelect
              ariaLabel="Link permission"
              value={linkPermission}
              onChange={(value) => handleUpdateLink(value as "view" | "edit")}
              options={[
                { label: "Viewer", value: "view", icon: <Eye size={13} /> },
                { label: "Editor", value: "edit", icon: <Pencil size={13} /> },
              ]}
              size="sm"
              variant="plain"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400 dark:text-neutral-500">Expiry:</span>
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
        </div>

        <p className="text-[11px] font-medium text-slate-450 dark:text-neutral-500">
          {formatAutoDisableText(activeLink.expiresAt)}
        </p>

        {expiryOption === "custom" && (
          <div className="flex flex-col gap-1 max-w-xs animate-in fade-in duration-200">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
              Custom Expiry Date
            </label>
            <input
              type="datetime-local"
              value={customExpiry}
              onChange={(event) => setCustomExpiry(event.target.value)}
              onBlur={() => void handleUpdateLink()}
              className="rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-705 outline-none focus:border-indigo-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            />
          </div>
        )}

        {linkPermission === "edit" && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
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
