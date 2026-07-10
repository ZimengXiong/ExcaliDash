import React, { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import clsx from "clsx";
import type { DrawingEngine } from "../../types";
import { usePreferences } from "../../context/PreferencesContext";
import { ENGINES, ENGINE_META, engineLabel } from "../../utils/engineMeta";
import { EnginePickerModal } from "./EnginePickerModal";

interface NewDrawingControlProps {
  disabled: boolean;
  onCreate: (engine: DrawingEngine) => void;
  // Optional gate run before opening the picker or creating. Return false to
  // abort (e.g. a viewer in a read-only shared collection); the gate is
  // responsible for surfacing its own message.
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
  const { preferences } = usePreferences();
  const defaultEngine = preferences.defaultEngine ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const guarded = (run: () => void) => () => {
    if (canCreate && !canCreate()) return;
    run();
  };

  // No stored default: a single button opens the two-card picker so the user
  // makes a deliberate, immutable engine choice.
  if (!defaultEngine) {
    return (
      <>
        <button
          onClick={guarded(() => setPickerOpen(true))}
          disabled={disabled}
          className={clsx(
            BASE_BUTTON,
            "w-full sm:w-auto rounded-xl",
            disabled ? DISABLED_BUTTON : ENABLED_BUTTON,
          )}
        >
          <Plus size={18} strokeWidth={2.5} /> New Drawing
        </button>
        <EnginePickerModal
          isOpen={pickerOpen}
          onCancel={() => setPickerOpen(false)}
          onSelect={(engine) => {
            setPickerOpen(false);
            onCreate(engine);
          }}
        />
      </>
    );
  }

  // A default is set: primary button creates with it; the dropdown offers the
  // other engine(s) as an explicit override.
  const otherEngines = ENGINES.filter((engine) => engine !== defaultEngine);

  return (
    <div className="relative w-full sm:w-auto flex">
      <button
        onClick={guarded(() => onCreate(defaultEngine))}
        disabled={disabled}
        className={clsx(
          BASE_BUTTON,
          "flex-1 sm:flex-none rounded-l-xl rounded-r-none border-r-0",
          disabled ? DISABLED_BUTTON : ENABLED_BUTTON,
        )}
        title={`New ${engineLabel(defaultEngine)} drawing`}
      >
        <Plus size={18} strokeWidth={2.5} /> New Drawing
      </button>
      <button
        onClick={guarded(() => setMenuOpen((open) => !open))}
        disabled={disabled}
        aria-label="Choose engine"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={clsx(
          BASE_BUTTON,
          "px-2.5 rounded-r-xl rounded-l-none",
          disabled ? DISABLED_BUTTON : ENABLED_BUTTON,
        )}
      >
        <ChevronDown size={16} strokeWidth={2.5} />
      </button>
      {menuOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 min-w-[200px] bg-white dark:bg-neutral-800 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] py-1 animate-in fade-in zoom-in-95 duration-100">
            {otherEngines.map((engine) => (
              <button
                key={engine}
                data-testid={`new-drawing-engine-${engine}`}
                onClick={() => {
                  setMenuOpen(false);
                  onCreate(engine);
                }}
                className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-neutral-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <Plus size={14} strokeWidth={2.5} />
                New {ENGINE_META[engine].label} drawing
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
