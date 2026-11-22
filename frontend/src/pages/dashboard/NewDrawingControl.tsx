import React from "react";
import { Plus } from "lucide-react";

interface NewDrawingControlProps {
  disabled: boolean;
  onCreate: () => void;
  // Optional gate run before creating. Return false to abort (e.g. a viewer
  // in a read-only shared collection); the gate is responsible for surfacing
  // its own message.
  canCreate?: () => boolean;
}

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
      className="ui-button-primary h-[42px] flex-1 whitespace-nowrap px-5 sm:flex-none"
    >
      <Plus size={18} strokeWidth={2.5} /> New Drawing
    </button>
  );
};
