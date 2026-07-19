import React, { useState } from "react";
import { Info } from "lucide-react";

type InfoPopoverProps = {
  label: string;
  children: React.ReactNode;
};

export const InfoPopover: React.FC<InfoPopoverProps> = ({
  label,
  children,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-indigo-300"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Info size={15} />
      </button>
      {open
        ? (
          <div className="order-last mt-2 w-full basis-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-800/60">
            {children}
          </div>
        )
        : null}
    </>
  );
};
