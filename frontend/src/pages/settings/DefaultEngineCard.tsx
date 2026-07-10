import React from "react";
import { Shapes } from "lucide-react";
import clsx from "clsx";
import type { DrawingEngine } from "../../types";
import { usePreferences } from "../../context/PreferencesContext";
import { ENGINE_META, ENGINES } from "../../utils/engineMeta";

type EngineChoice = DrawingEngine | "ask";

const OPTIONS: { value: EngineChoice; label: string }[] = [
  { value: "ask", label: "Ask every time" },
  ...ENGINES.map((engine) => ({
    value: engine as EngineChoice,
    label: ENGINE_META[engine].label,
  })),
];

export const DefaultEngineCard: React.FC = () => {
  const { preferences, setPreference } = usePreferences();
  const current: EngineChoice = preferences.defaultEngine ?? "ask";

  const handleSelect = (choice: EngineChoice) => {
    setPreference("defaultEngine", choice === "ask" ? null : choice);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
        <Shapes
          size={32}
          className="text-indigo-600 dark:text-indigo-400 hidden sm:block"
        />
        <Shapes
          size={24}
          className="text-indigo-600 dark:text-indigo-400 sm:hidden"
        />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          Default Engine
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[220px] mx-auto">
          Engine used when creating a new drawing. Choose "Ask every time" to
          pick per drawing.
        </p>
      </div>
      <div className="w-full flex flex-col items-stretch gap-2 pt-2">
        {OPTIONS.map((option) => {
          const selected = current === option.value;
          return (
            <button
              key={option.value}
              data-testid={`default-engine-${option.value}`}
              aria-pressed={selected}
              onClick={() => handleSelect(option.value)}
              className={clsx(
                "px-3 py-2 rounded-xl border-2 text-sm font-bold transition-all",
                selected
                  ? "bg-indigo-600 dark:bg-neutral-700 text-white border-black dark:border-neutral-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                  : "bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border-slate-300 dark:border-neutral-700 hover:border-black dark:hover:border-neutral-500 hover:-translate-y-0.5",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
