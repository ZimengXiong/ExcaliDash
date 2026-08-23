import React from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";

interface NewDrawingControlProps {
  disabled: boolean;
  onCreate: () => void;
  // Optional gate run before creating. Return false to abort (e.g. a viewer
  // in a read-only shared collection); the gate is responsible for surfacing
  // its own message.
  canCreate?: () => boolean;
}

const BASE_BUTTON =
  "h-[42px] flex items-center justify-center gap-2 px-6 border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] transition-all font-bold text-sm whitespace-nowrap";

const ENABLED_BUTTON =
  "bg-indigo-600 dark:bg-neutral-800 text-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:active:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]";

const DISABLED_BUTTON =
  "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-300 dark:border-slate-700 shadow-none cursor-not-allowed";

export const NewDrawingControl: React.FC<NewDrawingControlProps> = ({
  disabled,
  onCreate,
  canCreate,
}) => {
  return (
    <button
      onClick={() => {
        if (canCreate && !canCreate()) return;
        onCreate();
      }}
      disabled={disabled}
      className={clsx(
        BASE_BUTTON,
        "w-full sm:w-auto rounded-xl",
        disabled ? DISABLED_BUTTON : ENABLED_BUTTON,
      )}
    >
      <Plus size={18} strokeWidth={2.5} /> New Drawing
    </button>
  );
};
