import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as api from '../api';
import type { UserPreferences } from '../api';
import { useAuth } from './AuthContext';

type Preferences = UserPreferences;
type PreferenceKey = keyof Preferences;

const STORAGE_KEY = 'excalidash-preferences';

// Keys that participate in server sync + localStorage mirroring. Anything the
// server returns outside this set is ignored so a stale field can't leak in.
const KNOWN_KEYS: PreferenceKey[] = [
  'theme',
  'dashboardSortField',
  'dashboardSortDirection',
  'language',
  'gridStep',
];

const pickKnown = (source: Partial<Preferences>): Preferences => {
  const out: Preferences = {};
  for (const key of KNOWN_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
};

// One-time migration of the pre-context localStorage keys so an upgrade never
// drops a user's already-chosen theme/sort/language.
const readLegacyPreferences = (): Preferences => {
  const legacy: Preferences = {};
  try {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || theme === 'light') legacy.theme = theme;
  } catch {
    /* ignore unavailable storage */
  }
  try {
    const lang = localStorage.getItem('excalidash-lang');
    if (lang) legacy.language = lang;
  } catch {
    /* ignore */
  }
  try {
    const rawSort = localStorage.getItem('excalidash-dashboard-sort');
    if (rawSort) {
      const parsed = JSON.parse(rawSort) as {
        field?: unknown;
        direction?: unknown;
      };
      if (typeof parsed.field === 'string') {
        legacy.dashboardSortField = parsed.field as Preferences['dashboardSortField'];
      }
      if (typeof parsed.direction === 'string') {
        legacy.dashboardSortDirection =
          parsed.direction as Preferences['dashboardSortDirection'];
      }
    }
  } catch {
    /* ignore */
  }
  return pickKnown(legacy);
};

const readStoredPreferences = (): Preferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return pickKnown(parsed);
    }
  } catch {
    /* fall through to legacy migration */
  }
  return readLegacyPreferences();
};

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (partial: Partial<Preferences>) => void;
  setPreference: <K extends PreferenceKey>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(
  undefined,
);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [preferences, setPreferences] = useState<Preferences>(
    readStoredPreferences,
  );

  // Gate server writes until the initial GET has settled so a first-mount
  // change can never PUT a local default over the stored server value.
  const hydratedRef = useRef(false);
  // Signature of the value we know the server already holds, per key, so we
  // skip redundant PUTs (e.g. echoing back a value we just fetched).
  const lastPersistedRef = useRef<Partial<Record<PreferenceKey, string>>>({});

  // Re-fetch whenever the authenticated user id changes so per-user
  // preferences apply on login/switch without a hard refresh.
  useEffect(() => {
    let cancelled = false;
    api
      .getUserPreferences()
      .then((serverPreferences) => {
        if (cancelled) return;
        const known = pickKnown(serverPreferences);
        for (const key of Object.keys(known) as PreferenceKey[]) {
          lastPersistedRef.current[key] = JSON.stringify(known[key]);
        }
        if (Object.keys(known).length > 0) {
          setPreferences((prev) => ({ ...prev, ...known }));
        }
      })
      .catch(() => {
        // Anonymous/local screens keep using localStorage.
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Mirror to localStorage so anonymous/offline sessions and the next reload
  // keep the last-known values.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore unavailable storage in private/embedded contexts.
    }
  }, [preferences]);

  const updatePreferences = useCallback((partial: Partial<Preferences>) => {
    const known = pickKnown(partial);
    if (Object.keys(known).length === 0) return;
    setPreferences((prev) => ({ ...prev, ...known }));
    if (!hydratedRef.current) return;
    const toWrite: Partial<Preferences> = {};
    for (const key of Object.keys(known) as PreferenceKey[]) {
      const signature = JSON.stringify(known[key]);
      if (lastPersistedRef.current[key] !== signature) {
        lastPersistedRef.current[key] = signature;
        (toWrite as Record<string, unknown>)[key] = known[key];
      }
    }
    if (Object.keys(toWrite).length > 0) {
      api.updateUserPreferences(toWrite).catch(() => {
        // Keep the local preference even when anonymous/offline.
      });
    }
  }, []);

  const setPreference = useCallback(
    <K extends PreferenceKey>(key: K, value: Preferences[K]) => {
      updatePreferences({ [key]: value } as Partial<Preferences>);
    },
    [updatePreferences],
  );

  return (
    <PreferencesContext.Provider
      value={{ preferences, updatePreferences, setPreference }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = (): PreferencesContextType => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};

/**
 * Read/write a single server-backed preference. Returns a `[value, setValue]`
 * tuple; `value` falls back to `defaultValue` until the key is set.
 */
export const usePreference = <K extends PreferenceKey>(
  key: K,
  defaultValue: NonNullable<Preferences[K]>,
): readonly [NonNullable<Preferences[K]>, (value: Preferences[K]) => void] => {
  const { preferences, setPreference } = usePreferences();
  const value = (preferences[key] ??
    defaultValue) as NonNullable<Preferences[K]>;
  const setValue = useCallback(
    (next: Preferences[K]) => setPreference(key, next),
    [key, setPreference],
  );
  return [value, setValue] as const;
};
