import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as api from "../api";
import type { UserPreferences } from "../api";
import { useAuth } from "./AuthContext";

type Preferences = UserPreferences;
type PreferenceKey = keyof Preferences;

const STORAGE_KEY = "excalidash-preferences";

// Keys that participate in server sync + localStorage mirroring. Anything the
// server returns outside this set is ignored so a stale field can't leak in.
const KNOWN_KEYS: PreferenceKey[] = [
  "theme",
  "dashboardSortField",
  "dashboardSortDirection",
  "language",
  "gridStep",
  "editorAutoHide",
  "compactSidebar",
  "appendDroppedDrawings",
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
    const theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") legacy.theme = theme;
  } catch {
    /* ignore unavailable storage */
  }
  try {
    const lang = localStorage.getItem("excalidash-lang");
    if (lang) legacy.language = lang;
  } catch {
    /* ignore */
  }
  try {
    const rawSort = localStorage.getItem("excalidash-dashboard-sort");
    if (rawSort) {
      const parsed = JSON.parse(rawSort) as {
        field?: unknown;
        direction?: unknown;
      };
      if (typeof parsed.field === "string") {
        legacy.dashboardSortField =
          parsed.field as Preferences["dashboardSortField"];
      }
      if (typeof parsed.direction === "string") {
        legacy.dashboardSortDirection =
          parsed.direction as Preferences["dashboardSortDirection"];
      }
    }
  } catch {
    /* ignore */
  }
  return pickKnown(legacy);
};

const readStoredPreferences = (key: string): Preferences => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return pickKnown(parsed);
    }
  } catch {
    /* fall through to legacy migration */
  }
  return key === STORAGE_KEY ? readLegacyPreferences() : {};
};

type PreferenceSync = {
  key: string;
  hydrated: boolean;
  pending: Preferences;
  persisted: Partial<Record<PreferenceKey, string>>;
};

const persistPreferences = (sync: PreferenceSync, values: Preferences) => {
  const toWrite: Preferences = {};
  for (const key of Object.keys(values) as PreferenceKey[]) {
    const signature = JSON.stringify(values[key]);
    if (sync.persisted[key] !== signature) {
      sync.persisted[key] = signature;
      (toWrite as Record<string, unknown>)[key] = values[key];
    }
  }
  if (Object.keys(toWrite).length === 0) return;
  api.updateUserPreferences(toWrite).catch(() => {
    for (const key of Object.keys(toWrite) as PreferenceKey[]) {
      if (sync.persisted[key] === JSON.stringify(toWrite[key])) {
        delete sync.persisted[key];
      }
    }
  });
};

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (partial: Partial<Preferences>) => void;
  setPreference: <K extends PreferenceKey>(
    key: K,
    value: Preferences[K],
  ) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(
  undefined,
);
const UpdatePreferencesContext = createContext<
  PreferencesContextType["updatePreferences"] | undefined
>(undefined);
// Each single-field reader subscribes only to its own stored value.
const fieldContexts = Object.fromEntries(
  KNOWN_KEYS.map((key) => [
    key,
    createContext<Preferences[PreferenceKey]>(undefined),
  ]),
) as Record<PreferenceKey, React.Context<Preferences[PreferenceKey]>>;

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, authEnabled } = useAuth();
  const singleUser = authEnabled === false;
  const key = user && !singleUser ? `${STORAGE_KEY}:${user.id}` : STORAGE_KEY;
  const shouldSync = singleUser || Boolean(user);
  const [stored, setStored] = useState(() => ({
    key,
    values: readStoredPreferences(key),
  }));
  const preferences =
    stored.key === key ? stored.values : readStoredPreferences(key);
  if (stored.key !== key) setStored({ key, values: preferences });
  const syncRef = useRef<PreferenceSync | null>(null);

  useEffect(() => {
    if (!shouldSync) return;
    const sync: PreferenceSync = {
      key,
      hydrated: false,
      pending: {},
      persisted: {},
    };
    syncRef.current = sync;
    api
      .getUserPreferences()
      .then((serverPreferences) => {
        if (syncRef.current !== sync) return;
        const known = pickKnown(serverPreferences);
        for (const field of Object.keys(known) as PreferenceKey[]) {
          sync.persisted[field] = JSON.stringify(known[field]);
        }
        // Single-user installs can still have preferences from before server
        // persistence. Authenticated accounts use only their server values.
        const pending = { ...sync.pending };
        setStored((prev) =>
          prev.key === key
            ? {
                key,
                values: {
                  ...(singleUser ? prev.values : {}),
                  ...known,
                  ...pending,
                },
              }
            : prev,
        );
      })
      .catch(() => {
        // Keep the current account's local copy while the server is unavailable.
      })
      .finally(() => {
        if (syncRef.current !== sync) return;
        sync.hydrated = true;
        persistPreferences(sync, sync.pending);
        sync.pending = {};
      });
    return () => {
      syncRef.current = null;
    };
  }, [key, shouldSync, singleUser]);

  // Mirror to localStorage so anonymous/offline sessions and the next reload
  // keep the last-known values.
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {
      // Ignore unavailable storage in private/embedded contexts.
    }
  }, [key, preferences]);

  const updatePreferences = useCallback(
    (partial: Partial<Preferences>) => {
      const known = pickKnown(partial);
      if (Object.keys(known).length === 0) return;
      setStored((prev) =>
        prev.key === key ? { key, values: { ...prev.values, ...known } } : prev,
      );
      const sync = syncRef.current;
      if (!sync || sync.key !== key) return;
      if (sync.hydrated) persistPreferences(sync, known);
      else Object.assign(sync.pending, known);
    },
    [key],
  );

  const setPreference = useCallback(
    <K extends PreferenceKey>(key: K, value: Preferences[K]) => {
      updatePreferences({ [key]: value } as Partial<Preferences>);
    },
    [updatePreferences],
  );

  const value = useMemo(
    () => ({ preferences, updatePreferences, setPreference }),
    [preferences, updatePreferences, setPreference],
  );
  return (
    <PreferencesContext.Provider value={value}>
      <UpdatePreferencesContext.Provider value={updatePreferences}>
        {KNOWN_KEYS.reduceRight<React.ReactNode>((nested, field) => {
          const FieldContext = fieldContexts[field];
          return (
            <FieldContext.Provider value={preferences[field]}>
              {nested}
            </FieldContext.Provider>
          );
        }, children)}
      </UpdatePreferencesContext.Provider>
    </PreferencesContext.Provider>
  );
};

export const useUpdatePreferences = () => {
  const updatePreferences = useContext(UpdatePreferencesContext);
  if (!updatePreferences)
    throw new Error(
      "useUpdatePreferences must be used within a PreferencesProvider",
    );
  return updatePreferences;
};

export const usePreferences = (): PreferencesContextType => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
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
  const updatePreferences = useUpdatePreferences();
  const value = (useContext(fieldContexts[key]) ?? defaultValue) as NonNullable<
    Preferences[K]
  >;
  const setValue = useCallback(
    (next: Preferences[K]) => updatePreferences({ [key]: next }),
    [key, updatePreferences],
  );
  return [value, setValue] as const;
};
