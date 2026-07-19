import React from "react";
import { HelpCircle, Pencil, Shapes } from "lucide-react";
import type { DrawingEngine } from "../../types";
import { usePreferences } from "../../context/PreferencesContext";
import { ENGINE_META, ENGINES } from "../../utils/engineMeta";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import { SettingsRow } from "./SettingsRow";

type EngineChoice = DrawingEngine | "ask";

const OPTION_ICONS: Record<EngineChoice, React.ReactNode> = {
  ask: <HelpCircle size={14} />,
  excalidraw: <Pencil size={14} />,
  tldraw: <Shapes size={14} />,
};

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
    <SettingsRow
      icon={<Shapes size={20} />}
      tileClassName="border-black bg-violet-400 text-black dark:border-neutral-700 dark:bg-violet-400 dark:text-black"
      title="Default engine"
      description="For new drawings"
    >
      <PlayfulSelect
        ariaLabel="Default engine"
        value={current}
        onChange={(value) => handleSelect(value as EngineChoice)}
        options={OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          icon: OPTION_ICONS[option.value],
        }))}
      />
    </SettingsRow>
  );
};
