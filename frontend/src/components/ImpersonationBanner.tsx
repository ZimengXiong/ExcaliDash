import React, { useEffect, useMemo, useState } from 'react';
import { LogIn, RefreshCw, XCircle } from 'lucide-react';
import { api, isAxiosError } from '../api';
import { useAuth } from '../context/AuthContext';
import { PlayfulSelect } from './PlayfulSelect';
import {
  IMPERSONATION_KEY,
  USER_KEY,
  readImpersonationState,
  stopImpersonation as restoreImpersonation,
  type ImpersonationState,
} from '../utils/impersonation';

type ImpersonationTarget = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

type ImpersonationTargetsResponse = {
  users: ImpersonationTarget[];
};

type AuthStatusResponse = {
  authenticated?: boolean;
  user?: {
    impersonatorId?: string;
  } | null;
};

type ImpersonateResponse = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const normalizeTarget = (target: ImpersonationState['target']): ImpersonationTarget => ({
  id: target.id,
  email: target.email,
  name: target.name,
  role: 'USER',
  isActive: true,
});

export const ImpersonationBanner: React.FC = () => {
  const { authEnabled } = useAuth();
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [targets, setTargets] = useState<ImpersonationTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const clearLocalImpersonation = () => {
    localStorage.removeItem(IMPERSONATION_KEY);
    setImpersonation(null);
  };

  useEffect(() => {
    if (!authEnabled) {
      setImpersonation(null);
      return;
    }

    const sync = () => setImpersonation(readImpersonationState());
    sync();

      const verifyServerImpersonationState = async () => {
        try {
          const response = await api.get<AuthStatusResponse>('/auth/status');
          const serverImpersonating = Boolean(response.data?.authenticated && response.data?.user?.impersonatorId);
          if (!serverImpersonating && readImpersonationState()) {
            clearLocalImpersonation();
          }
        } catch {
          // Ignore transient auth-status failures; the next poll/storage event will resync.
        }
      };

    void verifyServerImpersonationState();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [authEnabled]);

  const loadTargets = async () => {
    if (!authEnabled || !impersonation) return;

    setLoadingTargets(true);
    setError('');

    try {
      const response = await api.get<ImpersonationTargetsResponse>('/auth/impersonation-targets');
      setTargets(response.data.users || []);
    } catch (err: unknown) {
      let message = 'Failed to load impersonation targets';
      if (isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
      setTargets([]);
    } finally {
      setLoadingTargets(false);
    }
  };

  useEffect(() => {
    void loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authEnabled, impersonation?.target.id, impersonation?.impersonator.id]);

  const options = useMemo(() => {
    if (!impersonation) return [];
    const currentTarget = normalizeTarget(impersonation.target);
    const targetMap = new Map<string, ImpersonationTarget>();
    targetMap.set(currentTarget.id, currentTarget);
    for (const user of targets) {
      if (!user?.id) continue;
      targetMap.set(user.id, user);
    }
    return Array.from(targetMap.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
    });
  }, [impersonation, targets]);

  const stop = async () => {
    if (!impersonation || busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await api.post<{ user?: { id: string; email: string; name: string } }>('/auth/stop-impersonation');
      restoreImpersonation();
      if (response.data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      }
      window.location.reload();
    } catch (err: unknown) {
      let message = 'Failed to stop impersonation';
      if (isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
        if (
          err.response?.status === 409 &&
          /not currently impersonating/i.test(message)
        ) {
          clearLocalImpersonation();
          window.location.reload();
          return;
        }
      }
      setError(message);
      setBusy(false);
    }
  };

  const switchTarget = async (userId: string) => {
    if (!impersonation || busy || userId === impersonation.target.id) return;

    setBusy(true);
    setError('');

    try {
      const response = await api.post<ImpersonateResponse>('/auth/impersonate', { userId });
      const latest = readImpersonationState() || impersonation;
      const nextState: ImpersonationState = {
        ...latest,
        target: {
          id: response.data.user.id,
          email: response.data.user.email,
          name: response.data.user.name,
        },
        startedAt: new Date().toISOString(),
      };

      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(nextState));
      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      window.location.reload();
    } catch (err: unknown) {
      let message = 'Failed to switch impersonation user';
      if (isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
      setBusy(false);
    }
  };

  if (!authEnabled || !impersonation) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[45] -mt-2 mb-6 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50/80 dark:bg-red-950/30 backdrop-blur-md px-3 py-2 shadow-sm transition-all duration-200">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 flex-shrink-0">
            <LogIn size={14} strokeWidth={2.5} />
            <span className="text-xs font-bold">Impersonating</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-red-900 dark:text-red-100 truncate">
              {impersonation.target.name}
            </span>
            <span className="hidden sm:inline text-xs font-medium text-red-800/60 dark:text-red-200/40 truncate">
              {impersonation.target.email}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden items-center gap-1.5 text-xs font-semibold text-red-700/60 dark:text-red-400/40 lg:flex">
            Switch:
          </div>
          <PlayfulSelect
            ariaLabel="Switch impersonation target"
            value={impersonation.target.id}
            onChange={(value) => {
              void switchTarget(value);
            }}
            disabled={busy || loadingTargets || options.length === 0}
            size="sm"
            buttonClassName="min-w-[140px] max-w-[200px]"
            options={options.map((target) => ({
              value: target.id,
              label: target.name,
            }))}
          />
          <button
            type="button"
            onClick={stop}
            disabled={busy}
            className="ui-button-danger h-8 px-3 text-[11px]"
          >
            <XCircle size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Stop</span>
          </button>
        </div>
      </div>

      {(loadingTargets || error) && (
        <div className="mt-1.5 pt-1.5 border-t border-red-200/50 dark:border-red-800/20 flex items-center gap-3 text-[10px] font-bold text-red-800 dark:text-red-300">
          {loadingTargets ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw size={10} className="animate-spin" />
              Syncing targets...
            </span>
          ) : null}
          {error ? <span className="truncate">{error}</span> : null}
          {error ? (
            <button
              type="button"
              onClick={() => void loadTargets()}
              className="ui-icon-button h-7 w-7 border-transparent bg-transparent shadow-none dark:bg-transparent"
            >
              Retry
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};
