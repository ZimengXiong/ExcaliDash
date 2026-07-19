import React from "react";

export const settingsSelectClass =
  "rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:border-neutral-500";

export const settingsButtonClass =
  "rounded-lg border-2 border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 transition-colors hover:border-black disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:border-neutral-400";

export const settingsPrimaryButtonClass =
  "rounded-lg border-2 border-black bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:border-neutral-600";

export const SettingsCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="divide-y divide-slate-100 rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
    {children}
  </div>
);

type SettingsSectionHeaderProps = {
  icon: React.ReactNode;
  tileClassName: string;
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
};

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
  icon,
  tileClassName,
  title,
  subtitle,
  children,
}) => (
  <div className="mb-3 flex items-center gap-3 px-1">
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 ${tileClassName}`}
    >
      {icon}
    </div>
    <div className="min-w-0">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-xs font-medium text-slate-500 dark:text-neutral-400">
          {subtitle}
        </p>
      ) : null}
    </div>
    {children ? (
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
      </div>
    ) : null}
  </div>
);

type SettingsRowProps = {
  icon?: React.ReactNode;
  tileClassName?: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
};

export const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  tileClassName,
  title,
  description,
  children,
}) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
    {icon ? (
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 ${tileClassName ?? ""}`}
      >
        {icon}
      </div>
    ) : null}
    <div className="min-w-0 flex-1 basis-40">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
        {title}
      </h3>
      {description ? (
        <div className="mt-0.5 text-xs font-medium text-slate-500 dark:text-neutral-400">
          {description}
        </div>
      ) : null}
    </div>
    {children ? (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    ) : null}
  </div>
);
