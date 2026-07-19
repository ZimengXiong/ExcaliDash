import React, { useEffect, useState } from "react";
import { BellOff, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import * as api from "../api";
import { PlayfulSelect } from "./PlayfulSelect";

const CHANNEL_KEY = "excalidash-update-channel";
const DISMISSED_VERSION_KEY = "excalidash-update-ignored-version";
const LAST_CHECK_KEY = "excalidash-update-last-check";
const UPDATE_INFO_KEY = "excalidash-update-info";
const CLOSED_VERSION_KEY = "excalidash-update-banner-closed-version";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const safeGetItem = (key: string): string | null => {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetItem = (key: string, value: string): void => {
  try {
    if (typeof window === "undefined") return;
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(key, value);
  } catch {
    // Ignore unavailable storage in private/embedded contexts.
  }
};

const safeGetSessionItem = (key: string): string | null => {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.sessionStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetSessionItem = (key: string, value: string): void => {
  try {
    if (typeof window === "undefined") return;
    const storage = window.sessionStorage;
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(key, value);
  } catch {
    // Ignore unavailable storage in private/embedded contexts.
  }
};

const readChannel = (): api.UpdateChannel => {
  const raw = safeGetItem(CHANNEL_KEY);
  return raw === "prerelease" ? "prerelease" : "stable";
};

const writeChannel = (channel: api.UpdateChannel) => {
  safeSetItem(CHANNEL_KEY, channel);
};

const lastCheckStorageKey = (channel: api.UpdateChannel) => `${LAST_CHECK_KEY}:${channel}`;
const updateInfoStorageKey = (channel: api.UpdateChannel) => `${UPDATE_INFO_KEY}:${channel}`;
const closedVersionStorageKey = (channel: api.UpdateChannel) => `${CLOSED_VERSION_KEY}:${channel}`;

const shouldCheckNow = (channel: api.UpdateChannel): boolean => {
  const raw = safeGetItem(lastCheckStorageKey(channel));
  const last = raw ? Number(raw) : NaN;
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= CHECK_INTERVAL_MS;
};

const markCheckedNow = (channel: api.UpdateChannel) => {
  safeSetItem(lastCheckStorageKey(channel), String(Date.now()));
};

const readCachedInfo = (channel: api.UpdateChannel): api.UpdateInfo | null => {
  const raw = safeGetItem(updateInfoStorageKey(channel));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as api.UpdateInfo;
  } catch {
    return null;
  }
};

const writeCachedInfo = (channel: api.UpdateChannel, info: api.UpdateInfo) => {
  safeSetItem(updateInfoStorageKey(channel), JSON.stringify(info));
};

export const UpdateBanner: React.FC = () => {
  const [channel, setChannel] = useState<api.UpdateChannel>(() => readChannel());
  const [info, setInfo] = useState<api.UpdateInfo | null>(() => readCachedInfo(readChannel()));
  const [loading, setLoading] = useState(false);
  const [ignoredVersion, setIgnoredVersion] = useState<string | null>(() =>
    safeGetItem(DISMISSED_VERSION_KEY)
  );
  const [closedVersion, setClosedVersion] = useState<string | null>(() =>
    safeGetSessionItem(closedVersionStorageKey(readChannel()))
  );

  const load = async (force: boolean) => {
    if (!force && !shouldCheckNow(channel)) return;
    setLoading(true);
    try {
      const data = await api.getUpdateInfo(channel);
      setInfo(data);
      writeCachedInfo(channel, data);
      markCheckedNow(channel);
    } catch {
      markCheckedNow(channel);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInfo(readCachedInfo(channel));
    setClosedVersion(safeGetSessionItem(closedVersionStorageKey(channel)));
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useEffect(() => {
    setIgnoredVersion(safeGetItem(DISMISSED_VERSION_KEY));
  }, [info?.latestVersion]);

  useEffect(() => {
    setClosedVersion(safeGetSessionItem(closedVersionStorageKey(channel)));
  }, [channel, info?.latestVersion]);

  const updateAvailable =
    info?.outboundEnabled &&
    info?.isUpdateAvailable === true &&
    Boolean(info.latestVersion) &&
    info.latestVersion !== ignoredVersion &&
    info.latestVersion !== closedVersion;

  if (!updateAvailable) return null;

  return (
    <div className="sticky top-0 z-[44] -mt-2 mb-6 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 backdrop-blur-md px-3 py-2 shadow-sm transition-all duration-200">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 flex-shrink-0">
            <span className="text-xs font-bold">Update available</span>
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-sm font-bold text-emerald-950 dark:text-emerald-50 truncate">
              v{info?.latestVersion}
            </span>
            <span className="hidden sm:inline text-xs font-medium text-emerald-900/60 dark:text-emerald-200/40">
              ({channel})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <PlayfulSelect
            ariaLabel="Update channel"
            value={channel}
            onChange={(value) => {
              const next = (value === "prerelease" ? "prerelease" : "stable") as api.UpdateChannel;
              writeChannel(next);
              setChannel(next);
            }}
            size="sm"
            options={[
              { value: "stable", label: "stable" },
              { value: "prerelease", label: "prerelease" },
            ]}
          />

          {info?.latestUrl ? (
            <a
              href={info.latestUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-button-primary h-8 px-3 text-xs"
            >
              <ExternalLink size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">Release</span>
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => {
              const latest = info?.latestVersion;
              if (!latest) return;
              safeSetSessionItem(closedVersionStorageKey(channel), latest);
              setClosedVersion(latest);
            }}
            className="ui-button-secondary h-8 px-3 text-[11px]"
            title="Close (will reappear later)"
          >
            <XCircle size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Close</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const latest = info?.latestVersion;
              if (!latest) return;
              safeSetItem(DISMISSED_VERSION_KEY, latest);
              setIgnoredVersion(latest);
            }}
            className="ui-button-secondary h-8 px-3 text-[11px]"
            title="Ignore this version"
          >
            <BellOff size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Ignore</span>
          </button>

          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="ui-icon-button h-8 w-8"
            title="Re-check now"
            aria-label="Re-check now"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
    </div>
  );
};
