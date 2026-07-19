import React from "react";

type PlayfulSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
};

export const PlayfulSwitch: React.FC<PlayfulSwitchProps> = ({
  checked,
  onChange,
  disabled,
  ariaLabel,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 shrink-0 rounded-full border-2 border-black transition-colors disabled:opacity-50 dark:border-neutral-600 ${
      checked ? "bg-emerald-400" : "bg-slate-200 dark:bg-neutral-700"
    }`}
  >
    <span
      className={`absolute top-0.5 h-4 w-4 rounded-full border-2 border-black bg-white transition-all dark:border-neutral-600 ${
        checked ? "left-[22px]" : "left-0.5"
      }`}
    />
  </button>
);
