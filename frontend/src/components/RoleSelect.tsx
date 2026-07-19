import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { CollectionShareRole } from "../types";

const ROLE_OPTIONS: {
  label: string;
  value: CollectionShareRole;
  danger?: boolean;
}[] = [
  { label: "Viewer", value: "view" },
  { label: "Editor", value: "edit" },
];

export const RoleSelect: React.FC<{
  value: CollectionShareRole;
  onChange: (val: string) => void;
  extraOptions?: { label: string; value: string; danger?: boolean }[];
}> = ({ value, onChange, extraOptions = [] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = [...ROLE_OPTIONS, ...extraOptions];
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-all outline-none"
      >
        {current.label}
        <ChevronDown
          size={14}
          className={clsx("transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="ui-menu absolute top-full right-0 mt-1 min-w-[150px] z-[200] animate-in fade-in zoom-in-95 duration-100">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onChange(option.value);
                setOpen(false);
              }}
              className={clsx(
                "ui-menu-item justify-between",
                option.value === value && "ui-menu-item-selected",
                option.danger && "ui-menu-item-danger",
              )}
            >
              {option.label}
              {option.value === value && !option.danger && <Check size={13} strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
