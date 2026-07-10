import React from "react";

/** Neutral loading state shown while the engine is being resolved. */
export const EditorLoading: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-neutral-950">
    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
      Loading drawing...
    </span>
  </div>
);
