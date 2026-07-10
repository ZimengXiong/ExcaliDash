import React from "react";
import { createPortal } from "react-dom";
import { PenTool, Shapes, X } from "lucide-react";
import type { DrawingEngine } from "../../types";
import { ENGINES, ENGINE_META } from "../../utils/engineMeta";

interface EnginePickerModalProps {
  isOpen: boolean;
  onSelect: (engine: DrawingEngine) => void;
  onCancel: () => void;
}

const ENGINE_ICON: Record<DrawingEngine, React.ReactNode> = {
  excalidraw: <PenTool size={24} strokeWidth={2.5} />,
  tldraw: <Shapes size={24} strokeWidth={2.5} />,
};

export const EnginePickerModal: React.FC<EnginePickerModalProps> = ({
  isOpen,
  onSelect,
  onCancel,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
        <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight mb-1">
          New drawing
        </h3>
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-5">
          Choose a canvas engine. This can't be changed after the drawing is
          created.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ENGINES.map((engine) => {
            const meta = ENGINE_META[engine];
            return (
              <button
                key={engine}
                data-testid={`engine-card-${engine}`}
                onClick={() => onSelect(engine)}
                className="flex flex-col items-start text-left gap-2 p-4 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.15)] hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] transition-all duration-200"
              >
                <span className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-neutral-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border-2 border-indigo-100 dark:border-neutral-700">
                  {ENGINE_ICON[engine]}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {meta.label}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-neutral-400 leading-relaxed">
                  {meta.blurb}
                </span>
                {meta.note && (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {meta.note}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
};
