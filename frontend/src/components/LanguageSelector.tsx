import React from 'react';
import { languages, useI18n } from '@excalidraw/excalidraw';

const STORAGE_KEY = 'excalidash-lang';

function detectLanguage(): string {
  const browserLangs = Array.from(navigator.languages ?? [navigator.language]);
  const supported = new Set(languages.map((l) => l.code));
  for (const bl of browserLangs) {
    if (supported.has(bl)) return bl;
    const prefix = bl.split('-')[0];
    const match = languages.find((l) => l.code.startsWith(prefix));
    if (match) return match.code;
  }
  return 'en';
}

export function getInitialLangCode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? detectLanguage();
  } catch {
    return detectLanguage();
  }
}

interface LanguageSelectorProps {
  langCode: string;
  onChange: (code: string) => void;
}

/**
 * Language selector rendered inside <Excalidraw> children so that `useI18n`
 * can access the Excalidraw i18n context.
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  langCode,
  onChange,
}) => {
  const { t } = useI18n();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore localStorage errors in restricted environments
    }
    onChange(code);
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
      <span style={{ fontSize: 13, flexShrink: 0 }}>
        {t('labels.language', null, 'Language')}
      </span>
      <select
        value={langCode}
        onChange={handleChange}
        style={{
          flex: 1,
          fontSize: 13,
          padding: '2px 4px',
          borderRadius: 4,
          border: '1px solid var(--color-surface-mid)',
          background: 'var(--color-surface-low)',
          color: 'var(--color-on-surface)',
          cursor: 'pointer',
        }}
        aria-label={t('labels.language', null, 'Language')}
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
