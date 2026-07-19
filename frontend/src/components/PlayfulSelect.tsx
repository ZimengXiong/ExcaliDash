import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";

export type PlayfulSelectOption = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
};

type PlayfulSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: PlayfulSelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  align?: "left" | "right";
  size?: "sm" | "md";
  variant?: "playful" | "plain";
  showCheck?: boolean;
};

export const PlayfulSelect: React.FC<PlayfulSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
  className,
  buttonClassName,
  menuClassName,
  align = "left",
  size = "md",
  variant = "playful",
  showCheck = true,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={clsx("relative inline-flex", className)} ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
        className={clsx(
          "flex w-full items-center gap-2 rounded-xl border-2 font-bold transition-all disabled:opacity-50",
          variant === "playful"
            ? "border-black bg-white text-slate-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] dark:hover:bg-indigo-900/30 dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]"
            : "border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700",
          open && variant === "playful" && "bg-indigo-50 dark:bg-indigo-900/30",
          size === "sm" ? "gap-1.5 px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm",
          buttonClassName,
        )}
      >
        {current?.icon ? (
          <span className="shrink-0 text-indigo-600 dark:text-indigo-400">
            {current.icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.label}
        </span>
        <ChevronDown
          size={size === "sm" ? 13 : 15}
          className={clsx(
            "shrink-0 text-slate-400 transition-transform dark:text-neutral-500",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className={clsx(
            "ui-menu absolute top-full z-[200] mt-2 w-max min-w-full animate-in fade-in zoom-in-95 duration-100",
            align === "right" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(option.value);
                  setOpen(false);
                }}
                className={clsx(
                  "ui-menu-item",
                  size === "sm" && "px-2 py-1.5 text-xs",
                  selected && showCheck && "ui-menu-item-selected",
                  option.danger && "ui-menu-item-danger",
                )}
              >
                {option.icon ? (
                  <span className="shrink-0 text-indigo-500 dark:text-indigo-400">
                    {option.icon}
                  </span>
                ) : null}
                <span className="truncate">{option.label}</span>
                {selected && showCheck ? (
                  <Check size={13} strokeWidth={3} className="ml-auto shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
