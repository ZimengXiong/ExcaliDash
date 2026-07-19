import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  portal?: boolean;
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
  portal = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [portalPosition, setPortalPosition] = useState<React.CSSProperties>();
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
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

  useLayoutEffect(() => {
    if (!open || !portal) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const gap = 8;
      const openUpward =
        menuHeight > 0 &&
        rect.bottom + gap + menuHeight > window.innerHeight &&
        rect.top - gap - menuHeight >= 0;

      setPortalPosition({
        position: "fixed",
        top: openUpward ? rect.top - gap - menuHeight : rect.bottom + gap,
        left: align === "left" ? rect.left : undefined,
        right: align === "right" ? window.innerWidth - rect.right : undefined,
        minWidth: rect.width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, open, portal]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="listbox"
      style={portal ? portalPosition : undefined}
      className={clsx(
        "ui-menu z-[200] w-max animate-in fade-in zoom-in-95 duration-100",
        portal
          ? "fixed"
          : "absolute top-full mt-2 min-w-full",
        !portal && (align === "right" ? "right-0" : "left-0"),
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
  ) : null;

  return (
    <div className={clsx("relative inline-flex", className)} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!open && portal && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPortalPosition({
              position: "fixed",
              top: rect.bottom + 8,
              left: align === "left" ? rect.left : undefined,
              right:
                align === "right" ? window.innerWidth - rect.right : undefined,
              minWidth: rect.width,
            });
          }
          setOpen((previous) => !previous);
        }}
        className={clsx(
          "w-full",
          variant === "playful"
            ? "ui-button-secondary text-slate-700 dark:text-neutral-300"
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

      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
};
