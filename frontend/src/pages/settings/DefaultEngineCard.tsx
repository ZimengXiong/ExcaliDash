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
      tileClassName="border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"
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
