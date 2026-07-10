import React from 'react';
import { useI18n } from '@excalidraw/excalidraw';

/** Excalidraw's built-in default number of cells between bold grid lines. */
export const DEFAULT_GRID_STEP = 5;
export const MIN_GRID_STEP = 1;
export const MAX_GRID_STEP = 100;

export const clampGridStep = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_GRID_STEP;
  return Math.min(MAX_GRID_STEP, Math.max(MIN_GRID_STEP, Math.round(value)));
};

interface GridStepSelectorProps {
  gridStep: number;
  onChange: (gridStep: number) => void;
}

/**
 * Grid-step control rendered inside <Excalidraw> children so `useI18n` can read
 * the Excalidraw i18n context. The embedded editor exposes `gridStep` in
 * appState but ships no UI for it, so we surface our own. Persistence
 * (localStorage mirror + server sync) is owned by the preferences context via
 * the `onChange` handler.
 */
export const GridStepSelector: React.FC<GridStepSelectorProps> = ({
  gridStep,
  onChange,
}) => {
  const { t } = useI18n();
  const label = t('labels.gridStep', null, 'Grid step');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(e.target.value, 10);
    if (Number.isNaN(parsed)) return;
    onChange(clampGridStep(parsed));
  };

  return (
    <div
      style={{
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
      }}
    >
      <span style={{ fontSize: 13, flexShrink: 0 }}>{label}</span>
      <input
        type="number"
        min={MIN_GRID_STEP}
        max={MAX_GRID_STEP}
        step={1}
        value={gridStep}
        onChange={handleChange}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          padding: '2px 4px',
          borderRadius: 4,
          border: '1px solid var(--color-surface-mid)',
          background: 'var(--color-surface-low)',
          color: 'var(--color-on-surface)',
        }}
        aria-label={label}
      />
    </div>
  );
};
