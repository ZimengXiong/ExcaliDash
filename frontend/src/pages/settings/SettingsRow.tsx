import React from "react";

export const settingsSelectClass =
  "ui-input";

export const settingsButtonClass =
  "ui-button-secondary";

export const settingsPrimaryButtonClass =
  "ui-button-primary";

export const SettingsCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="ui-card overflow-hidden divide-y divide-slate-100 dark:divide-neutral-800">
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
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
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
