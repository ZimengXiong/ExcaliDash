import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";

type Option = { label: string; value: string; danger?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
  icon?: React.ReactNode;
  align?: "left" | "right";
  showCheck?: boolean;
  variant?: "ghost" | "bordered";
};

export const CustomSelect: React.FC<Props> = ({
  value,
  onChange,
  options,
  className,
  icon,
  align = "left",
  showCheck = true,
  variant = "ghost",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const currentOption =
    options.find((option) => option.value === value) || options[0];

  return (
    <div
      className={clsx("relative inline-flex items-center", className)}
      ref={containerRef}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-sm font-medium outline-none",
          variant === "bordered"
            ? "border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800"
            : "hover:bg-gray-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300",
        )}
      >
        {icon}
        <span>{currentOption.label}</span>
        <ChevronDown
          size={14}
          className={clsx(
            "transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          className={clsx(
            "ui-popover absolute top-full z-[100] mt-1.5 min-w-[140px] overflow-hidden animate-in fade-in zoom-in-95 duration-100",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(option.value);
                setIsOpen(false);
              }}
              className={clsx(
                "w-full text-left px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-between border-b last:border-b-0 border-slate-100 dark:border-neutral-800",
                option.value === value && showCheck
                  ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                  : option.danger
                    ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    : "text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800",
              )}
            >
              {option.label}
              {option.value === value && showCheck && (
                <Check size={12} strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
