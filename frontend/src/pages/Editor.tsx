import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import { Toaster, toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import type { UserIdentity } from '../utils/identity';
import { useAuth } from '../context/AuthContext';
import { reconcileElements } from '../utils/sync';
import { exportFromEditor } from '../utils/exportUtils';
import * as api from '../api';
import { useTheme } from '../context/ThemeContext';
import {
  UIOptions,
  getFilesDelta,
  hasRenderableElements,
  haveSameElements,
  isSuspiciousEmptySnapshot,
  isStaleEmptySnapshot,
  isStaleNonRenderableSnapshot,
} from './editor/shared';
import type { ElementVersionInfo } from './editor/shared';
import { useEditorChrome } from './editor/useEditorChrome';
import { useEditorIdentity } from './editor/useEditorIdentity';

interface Peer extends UserIdentity {
  isActive: boolean;
}

class DrawingSaveConflictError extends Error {
  constructor(message = "Drawing version conflict") {
    super(message);
    this.name = "DrawingSaveConflictError";
  }
}

export const Editor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [drawingName, setDrawingName] = useState('Drawing Editor');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [initialData, setInitialData] = useState<any>(null);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);
  const [autoHideEnabled, setAutoHideEnabled] = useState(true);
  const { isHeaderVisible, setIsHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled,
    isRenaming,
  });
  const me: UserIdentity = useEditorIdentity(user);

  const [peers, setPeers] = useState<Peer[]>([]);
  const [isReady, setIsReady] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmit = useRef<number>(0);
  const elementVersionMap = useRef<Map<string, ElementVersionInfo>>(new Map());
  const isBootstrappingScene = useRef(true);
  const hasHydratedInitialScene = useRef(false);
  const isUnmounting = useRef(false);
  const isSyncing = useRef(false);
  const cursorBuffer = useRef<Map<string, any>>(new Map());
  const animationFrameId = useRef<number>(0);
  const latestElementsRef = useRef<readonly any[]>([]);
  const initialSceneElementsRef = useRef<readonly any[]>([]);
  const latestFilesRef = useRef<any>(null);
  const lastSyncedFilesRef = useRef<Record<string, any>>({});
  const latestAppStateRef = useRef<any>(null);
  const debouncedSaveRef = useRef<((drawingId: string, elements: readonly any[], appState: any, files?: Record<string, any>) => void) | null>(null);
  const currentDrawingVersionRef = useRef<number | null>(null);
  const lastPersistedElementsRef = useRef<readonly any[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const patchedAddFilesApisRef = useRef<WeakSet<object>>(new WeakSet());
  const suspiciousBlankLoadRef = useRef(false);
  const hasSceneChangesSinceLoadRef = useRef(false);

  const getRenderableBaselineSnapshot = useCallback((): readonly any[] => {
    if (hasRenderableElements(lastPersistedElementsRef.current)) {
      return lastPersistedElementsRef.current;
    }
    if (hasRenderableElements(initialSceneElementsRef.current)) {
      return initialSceneElementsRef.current;
    }
    return latestElementsRef.current;
  }, []);

  const hasIntentionalDeletionDelta = useCallback(
    (baseline: readonly any[] = [], candidate: readonly any[] = []): boolean => {
      if (!Array.isArray(candidate) || candidate.length === 0) return false;
      if (!hasRenderableElements(baseline)) return false;
      if (hasRenderableElements(candidate)) return false;

      const baselineById = new Map(
        baseline.map((element: any) => [element?.id, element])
      );

      const getVersion = (element: any): number =>
        typeof element?.version === "number" ? element.version : 0;
      const getUpdated = (element: any): number => {
        const value = element?.updated;
        return typeof value === "number" ? value : Number(value) || 0;
      };

      return candidate.some((element: any) => {
        if (!element || element.isDeleted !== true || typeof element.id !== "string") {
          return false;
        }

        const previous = baselineById.get(element.id);
        if (!previous) return false;
        if (previous.isDeleted === true) return false;

        const nextVersion = getVersion(element);
        const prevVersion = getVersion(previous);
        if (nextVersion > prevVersion) return true;

        const nextUpdated = getUpdated(element);
        const prevUpdated = getUpdated(previous);
        if (nextVersion === prevVersion && nextUpdated > prevUpdated) return true;

        // Fallback for callers that may not bump version/updated consistently.
        return nextVersion === prevVersion && nextUpdated === prevUpdated;
      });
    },
    []
  );

  const resolveSafeSnapshot = useCallback(
    (candidateSnapshot: readonly any[] = []) => {
      const baseline = getRenderableBaselineSnapshot();
      const staleEmptySnapshot = isStaleEmptySnapshot(baseline, candidateSnapshot);
      const staleNonRenderableSnapshot = isStaleNonRenderableSnapshot(
        baseline,
        candidateSnapshot
      );
      const intentionalDeletionDelta = staleNonRenderableSnapshot
        ? hasIntentionalDeletionDelta(baseline, candidateSnapshot)
        : false;

      if (staleEmptySnapshot || (staleNonRenderableSnapshot && !intentionalDeletionDelta)) {
        return {
          snapshot: baseline,
          prevented: true,
          staleEmptySnapshot,
          staleNonRenderableSnapshot,
        } as const;
      }

      return {
        snapshot: candidateSnapshot,
        prevented: false,
        staleEmptySnapshot: false,
        staleNonRenderableSnapshot: false,
      } as const;
    },
    [getRenderableBaselineSnapshot]
  );

  const normalizeImageElementStatus = useCallback(
    (elements: readonly any[] = [], files?: Record<string, any> | null): readonly any[] => {
      if (!Array.isArray(elements) || elements.length === 0) return elements;
      const fileMap = files || {};
      let changed = false;

      const normalized = elements.map((element: any) => {
        if (!element || element.type !== "image" || typeof element.fileId !== "string") {
          return element;
        }

        const file = fileMap[element.fileId];
        const hasImageData =
          typeof file?.dataURL === "string" &&
          file.dataURL.startsWith("data:image/") &&
          file.dataURL.length > 0;

        if (!hasImageData || element.status === "saved") {
          return element;
        }

        changed = true;
        return {
          ...element,
          status: "saved",
        };
      });

      return changed ? normalized : elements;
    },
    []
  );

  const emitFilesDeltaIfNeeded = useCallback(
    (nextFiles: Record<string, any>) => {
      if (!socketRef.current || !id) return false;
      const filesDelta = getFilesDelta(lastSyncedFilesRef.current, nextFiles || {});
      if (Object.keys(filesDelta).length === 0) return false;

      latestFilesRef.current = nextFiles;
      lastSyncedFilesRef.current = nextFiles;

      if (import.meta.env.DEV) {
        const dbg = ((window as any).__EXCALIDASH_E2E_DEBUG__ ||= {
          fileEmits: 0,
          lastFilesDeltaIds: [] as string[],
        });
        dbg.fileEmits += 1;
        dbg.lastFilesDeltaIds = Object.keys(filesDelta);
      }

      socketRef.current.emit("element-update", {
        drawingId: id,
        elements: [],
        files: filesDelta,
        userId: me.id,
      });

      return true;
    },
    [id, me.id]
  );

  const recordElementVersion = useCallback((element: any) => {
    elementVersionMap.current.set(element.id, {
      version: element.version ?? 0,
      versionNonce: element.versionNonce ?? 0,
    });
  }, []);

  const hasElementChanged = useCallback((element: any) => {
    const previous = elementVersionMap.current.get(element.id);
    if (!previous) return true;

    const nextVersion = element.version ?? 0;
    const nextNonce = element.versionNonce ?? 0;

    return previous.version !== nextVersion || previous.versionNonce !== nextNonce;
  }, []);

  useEffect(() => {
    isUnmounting.current = false;
    return () => {
      isUnmounting.current = true;
    };
  }, []);

  useEffect(() => {
    if (!id || !isReady) return;

    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const usingRelativeApiBasePath = apiUrl.startsWith('/');
    const socketUrl = usingRelativeApiBasePath
      ? window.location.origin
      : apiUrl;
    const socketPath = (() => {
      if (usingRelativeApiBasePath) {
        const normalized = apiUrl.endsWith('/') && apiUrl.length > 1 ? apiUrl.slice(0, -1) : apiUrl;
        return normalized === '/' ? '/socket.io' : `${normalized}/socket.io`;
      }
      try {
        const parsed = new URL(apiUrl);
        const normalizedPath =
          parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
            ? parsed.pathname.slice(0, -1)
            : parsed.pathname;
        return normalizedPath === '/' ? '/socket.io' : `${normalizedPath}/socket.io`;
      } catch {
        return '/socket.io';
      }
    })();

    const socket = io(socketUrl, {
      path: socketPath,
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    // DEV-only: expose socket status for E2E tests to wait for connection.
    if (import.meta.env.DEV) {
      (window as any).__EXCALIDASH_SOCKET_STATUS__ = {
        connected: socket.connected,
      };
      socket.on("connect", () => {
        (window as any).__EXCALIDASH_SOCKET_STATUS__ = { connected: true };
      });
      socket.on("disconnect", () => {
        (window as any).__EXCALIDASH_SOCKET_STATUS__ = { connected: false };
      });
    }

    socket.emit('join-room', { drawingId: id, user: me });

    // Start the render loop for cursors
    const renderLoop = () => {
      if (cursorBuffer.current.size > 0 && excalidrawAPI.current) {
        const collaborators = new Map(excalidrawAPI.current.getAppState().collaborators || []);

        cursorBuffer.current.forEach((data, userId) => {
          collaborators.set(userId, data);
        });

        cursorBuffer.current.clear();
        excalidrawAPI.current.updateScene({ collaborators });
      }
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    socket.on('presence-update', (users: Peer[]) => {
      setPeers(users.filter(u => u.id !== me.id));

      if (excalidrawAPI.current) {
        const collaborators = new Map(excalidrawAPI.current.getAppState().collaborators || []);
        users.forEach(user => {
          if (!user.isActive && user.id !== me.id) {
            collaborators.delete(user.id);
          }
        });
        excalidrawAPI.current.updateScene({ collaborators });
      }
    });

    socket.on('cursor-move', (data: any) => {
      cursorBuffer.current.set(data.userId, {
        pointer: data.pointer,
        button: data.button || 'up',
        selectedElementIds: data.selectedElementIds || {},
        username: data.username,
        color: { background: data.color, stroke: data.color },
        id: data.userId,
      });
    });

    socket.on('element-update', ({ elements, files }: { elements: any[]; files?: Record<string, any> }) => {
      if (!excalidrawAPI.current) return;

      isSyncing.current = true;

      const currentAppState = excalidrawAPI.current.getAppState();
      const mySelectedIds = currentAppState.selectedElementIds || {};

      // Don't overwrite elements I'm actively editing/dragging in this tab,
      // BUT always apply remote deletions so all tabs converge.
      const validRemoteElements = elements.filter(
        (el: any) => el?.isDeleted || !mySelectedIds[el.id]
      );

      const localElements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
      const mergedElements = reconcileElements(localElements, validRemoteElements);

      validRemoteElements.forEach((el: any) => {
        recordElementVersion(el);
      });

      const incomingFiles = files || {};
      const shouldUpdateFiles = Object.keys(incomingFiles).length > 0;
      const nextFiles = shouldUpdateFiles
        ? { ...lastSyncedFilesRef.current, ...incomingFiles }
        : lastSyncedFilesRef.current;

      if (shouldUpdateFiles && typeof excalidrawAPI.current.addFiles === "function") {
        // Excalidraw manages binary files separately from scene elements; updateScene(files)
        // is not reliable for syncing pasted images across tabs.
        excalidrawAPI.current.addFiles(Object.values(incomingFiles));
      }

      excalidrawAPI.current.updateScene({ elements: mergedElements });
      latestElementsRef.current = mergedElements;
      if (shouldUpdateFiles) {
        latestFilesRef.current = nextFiles;
        lastSyncedFilesRef.current = nextFiles;
      }
      isSyncing.current = false;
    });


    const handleActivity = (isActive: boolean) => {
      socket.emit('user-activity', { drawingId: id, isActive });
    };

    const onFocus = () => handleActivity(true);
    const onBlur = () => handleActivity(false);
    const onMouseEnter = () => handleActivity(true);
    const onMouseLeave = () => handleActivity(false);

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mouseenter', onMouseEnter);
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mouseenter', onMouseEnter);
      document.removeEventListener('mouseleave', onMouseLeave);
      socket.off('presence-update');
      socket.off('cursor-move');
      socket.off('element-update');
      socket.disconnect();
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [id, me, isReady, recordElementVersion]);

  const onPointerUpdate = useCallback((payload: any) => {
    const now = Date.now();
    if (now - lastCursorEmit.current > 50 && socketRef.current) {
      socketRef.current.emit('cursor-move', {
        pointer: payload.pointer,
        button: payload.button,
        username: me.name,
        userId: me.id,
        drawingId: id,
        color: me.color
      });
      lastCursorEmit.current = now;
    }
  }, [id, me]);

  // Refs for API interaction
  const excalidrawAPI = useRef<any>(null);

  const setExcalidrawAPI = useCallback((api: any) => {
    excalidrawAPI.current = api;
    // DEV-only: expose API for debugging/e2e reproduction of collaboration bugs.
    // This is intentionally not relied upon by app logic.
    if (import.meta.env.DEV) {
      (window as any).__EXCALIDASH_EXCALIDRAW_API__ = api;
    }

    // Ensure file-only updates (e.g. pasted image dataURL arriving asynchronously)
    // are broadcast immediately even if Excalidraw doesn't trigger `onChange` for files.
    if (api && typeof api.addFiles === "function" && !patchedAddFilesApisRef.current.has(api as object)) {
      patchedAddFilesApisRef.current.add(api as object);
      const originalAddFiles = api.addFiles.bind(api);
      api.addFiles = (filesInput: Record<string, any> | any[]) => {
        const normalizedFiles = Array.isArray(filesInput)
          ? filesInput
          : Object.values(filesInput || {});
        originalAddFiles(normalizedFiles);

        // Avoid rebroadcast loops when we are applying remote updates.
        if (isSyncing.current) return;

        const nextFiles = api.getFiles?.() || {};
        const didEmit = emitFilesDeltaIfNeeded(nextFiles);

        // Persist after file data becomes available so new tabs (tab3) load correctly.
        if (didEmit && id && latestAppStateRef.current && debouncedSaveRef.current) {
          hasSceneChangesSinceLoadRef.current = true;
          debouncedSaveRef.current(id, latestElementsRef.current, latestAppStateRef.current, latestFilesRef.current || {});
        }
      };
    }
    setIsReady(true);
  }, [emitFilesDeltaIfNeeded, id]);

  // Handle #addLibrary URL hash parameter for importing libraries from links
  useEffect(() => {
    if (!isReady || !excalidrawAPI.current) return;

    const hash = window.location.hash;
    if (!hash.includes('addLibrary=')) return;

    const params = new URLSearchParams(hash.slice(1)); // Remove the leading #
    const libraryUrl = params.get('addLibrary');

    if (!libraryUrl) return;

    const importLibraryFromUrl = async () => {
      try {
        console.log('[Editor] Importing library from URL:', libraryUrl);
        toast.loading('Importing library...', { id: 'library-import' });

        const response = await fetch(libraryUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch library: ${response.statusText}`);
        }

        const blob = await response.blob();

        await excalidrawAPI.current.updateLibrary({
          libraryItems: blob,
          merge: true,
          defaultStatus: "published",
          openLibraryMenu: true,
        });

        const updatedItems = excalidrawAPI.current.getAppState().libraryItems || [];
        await api.updateLibrary([...updatedItems]);

        toast.success('Library imported successfully', { id: 'library-import' });
        console.log('[Editor] Library import complete');

        // Clear the hash to prevent re-importing on refresh
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (err) {
        console.error('[Editor] Failed to import library:', err);
        toast.error('Failed to import library', { id: 'library-import' });
      }
    };

    importLibraryFromUrl();
  }, [isReady]);

  const buildEmptyScene = useCallback(() => ({
    elements: [],
    appState: {
      viewBackgroundColor: '#ffffff',
      gridSize: null,
      collaborators: new Map(),
    },
    files: {},
    scrollToContent: true,
  }), []);

  const saveDataRef = useRef<((drawingId: string, elements: readonly any[], appState: any, files?: Record<string, any>) => Promise<void>) | null>(null);
  const savePreviewRef = useRef<((drawingId: string, elements: readonly any[], appState: any, files: any) => Promise<void>) | null>(null);
  const saveLibraryRef = useRef<((items: any[]) => Promise<void>) | null>(null);

  saveDataRef.current = async (drawingId: string, elements: readonly any[], appState: any, files?: Record<string, any>) => {
    if (!drawingId) return;

    try {
      const persistableAppState = {
        ...appState,
        viewBackgroundColor: appState?.viewBackgroundColor || '#ffffff',
        gridSize: appState?.gridSize || null,
      };

      const candidateElements = Array.isArray(elements) ? elements : [];
      const {
        snapshot: safeElements,
        prevented,
        staleEmptySnapshot,
        staleNonRenderableSnapshot,
      } = resolveSafeSnapshot(candidateElements);
      const persistableElements = Array.from(safeElements);
      if (suspiciousBlankLoadRef.current && !hasRenderableElements(persistableElements)) {
        console.warn("[Editor] Blocking non-renderable save due to suspicious blank load", {
          drawingId,
          elementCount: persistableElements.length,
        });
        return;
      }
      if (staleEmptySnapshot || staleNonRenderableSnapshot) {
        console.warn("[Editor] Skipping stale snapshot save", {
          drawingId,
          candidateElementCount: candidateElements.length,
          fallbackElementCount: persistableElements.length,
          prevented,
          staleEmptySnapshot,
          staleNonRenderableSnapshot,
        });
        return;
      }
      const persistableFiles = files ?? latestFilesRef.current ?? {};
      const normalizedElements = normalizeImageElementStatus(
        persistableElements,
        persistableFiles
      );
      const normalizedElementsForSave = Array.from(normalizedElements);

      console.log("[Editor] Saving drawing", {
        drawingId,
        elementCount: normalizedElementsForSave.length,
        hasRenderableElements: hasRenderableElements(normalizedElementsForSave),
        appState: persistableAppState,
      });

      const persistScene = async (attempt: number): Promise<void> => {
        try {
          const updated = await api.updateDrawing(drawingId, {
            elements: normalizedElementsForSave,
            appState: persistableAppState,
            files: persistableFiles,
            version: currentDrawingVersionRef.current ?? undefined,
          });
          if (typeof updated.version === "number") {
            currentDrawingVersionRef.current = updated.version;
          }
          lastPersistedElementsRef.current = normalizedElementsForSave;
          console.log("[Editor] Save complete", { drawingId });
        } catch (err) {
          if (api.isAxiosError(err) && err.response?.status === 409) {
            const reportedVersion = Number(err.response?.data?.currentVersion);
            const hasReportedVersion = Number.isInteger(reportedVersion) && reportedVersion > 0;
            if (hasReportedVersion) {
              currentDrawingVersionRef.current = reportedVersion;
            }

            if (attempt === 0 && hasReportedVersion) {
              console.warn("[Editor] Version conflict while saving drawing, retrying once", {
                drawingId,
                currentVersion: reportedVersion,
              });
              await persistScene(1);
              return;
            }

            throw new DrawingSaveConflictError();
          }

          throw err;
        }
      };

      await persistScene(0);
    } catch (err) {
      if (err instanceof DrawingSaveConflictError) {
        console.warn("[Editor] Version conflict while saving drawing", { drawingId });
        toast.error("Drawing changed in another tab. Refresh to load latest.");
        throw err;
      }
      console.error('Failed to save drawing', err);
      toast.error("Failed to save changes");
      throw err;
    }
  };

  const enqueueSceneSave = useCallback(
    (
      drawingId: string,
      elements: readonly any[],
      appState: any,
      files?: Record<string, any>,
      options?: { suppressErrors?: boolean }
    ) => {
      const suppressErrors = options?.suppressErrors ?? true;
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (!saveDataRef.current) return;
          if (suppressErrors) {
            try {
              await saveDataRef.current(drawingId, elements, appState, files);
            } catch {
              // Background autosaves already surface their own toast via saveDataRef.
            }
            return;
          }
          await saveDataRef.current(drawingId, elements, appState, files);
        });
      return saveQueueRef.current;
    },
    []
  );

  savePreviewRef.current = async (drawingId: string, elements: readonly any[], appState: any, files: any) => {
    if (!drawingId) return;

    try {
      const snapshotFromArgs = Array.isArray(elements) ? elements : [];
      const snapshotFromRef = latestElementsRef.current ?? [];
      const candidateSnapshot =
        hasRenderableElements(snapshotFromArgs) || !hasRenderableElements(snapshotFromRef)
          ? snapshotFromArgs
          : snapshotFromRef;
      const {
        snapshot: currentSnapshot,
        prevented: preventedPreviewOverwrite,
        staleEmptySnapshot: staleEmptyPreview,
        staleNonRenderableSnapshot: staleNonRenderablePreview,
      } = resolveSafeSnapshot(candidateSnapshot);
      const currentFiles = latestFilesRef.current ?? files;
      const normalizedSnapshot = normalizeImageElementStatus(currentSnapshot, currentFiles);
      if (suspiciousBlankLoadRef.current && !hasRenderableElements(currentSnapshot)) {
        console.warn("[Editor] Blocking non-renderable preview due to suspicious blank load", {
          drawingId,
          elementCount: currentSnapshot.length,
        });
        return;
      }

      if (preventedPreviewOverwrite) {
        console.warn("[Editor] Prevented stale snapshot preview overwrite", {
          drawingId,
          staleEmptyPreview,
          staleNonRenderablePreview,
          fallbackElementCount: currentSnapshot.length,
        });
      }

      const svg = await exportToSvg({
        elements: normalizedSnapshot,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
        },
        files: currentFiles,
      });
      const preview = svg.outerHTML;

      console.log("[Editor] Saving preview", {
        drawingId,
        elementCount: normalizedSnapshot.length,
      });

      await api.updateDrawing(drawingId, { preview });

      console.log("[Editor] Preview save complete", { drawingId });
    } catch (err) {
      console.error('Failed to save preview', err);
    }
  };

  saveLibraryRef.current = async (items: any[]) => {
    try {
      console.log("[Editor] Saving library", { itemCount: items.length });
      await api.updateLibrary(items);
      console.log("[Editor] Library save complete");
    } catch (err) {
      console.error('Failed to save library', err);
      toast.error("Failed to save library");
    }
  };


  const debouncedSave = useCallback(
    debounce((drawingId, elements, appState, files) => {
      enqueueSceneSave(drawingId, elements, appState, files);
    }, 1000),
    [enqueueSceneSave] // Stable queue wrapper avoids concurrent version conflicts
  );
  // Allow non-hook code (e.g., Excalidraw API wrappers) to trigger debounced saves.
  debouncedSaveRef.current = debouncedSave;
  const debouncedSavePreview = useCallback(
    debounce((drawingId, elements, appState, files) => {
      if (savePreviewRef.current) {
        savePreviewRef.current(drawingId, elements, appState, files);
      }
    }, 10000),
    []
  );

  const debouncedSaveLibrary = useCallback(
    debounce((items: any[]) => {
      if (saveLibraryRef.current) {
        saveLibraryRef.current(items);
      }
    }, 1000),
    []
  );

  useEffect(() => {
    return () => {
      debouncedSave.cancel();
      debouncedSavePreview.cancel();
    };
  }, [debouncedSave, debouncedSavePreview]);

  const broadcastChanges = useCallback(
    throttle((elements: readonly any[], currentFiles?: Record<string, any>) => {
      if (!socketRef.current || !id) return;

      const changes: any[] = [];

      elements.forEach((el) => {
        if (hasElementChanged(el)) {
          changes.push(el);
          recordElementVersion(el);
        }
      });

      const nextFiles = currentFiles || excalidrawAPI.current?.getFiles() || {};
      const filesDelta = getFilesDelta(lastSyncedFilesRef.current, nextFiles);
      const shouldSyncFiles = Object.keys(filesDelta).length > 0;

      if (Object.keys(nextFiles || {}).length > 0) {
        latestFilesRef.current = nextFiles;
      }
      if (shouldSyncFiles) {
        // Keep our baseline in sync so we only send deltas next time.
        lastSyncedFilesRef.current = nextFiles;
      }

      if (changes.length > 0 || shouldSyncFiles) {
        socketRef.current.emit('element-update', {
          drawingId: id,
          elements: changes.length > 0 ? changes : [],
          files: shouldSyncFiles ? filesDelta : undefined,
          userId: me.id
        });
      }
    }, 100, { leading: true, trailing: true }),
    [id, hasElementChanged, recordElementVersion]
  );

  useEffect(() => {
    isBootstrappingScene.current = true;
    hasHydratedInitialScene.current = false;
    elementVersionMap.current.clear();
    saveQueueRef.current = Promise.resolve();
    latestElementsRef.current = [];
    initialSceneElementsRef.current = [];
    latestFilesRef.current = {};
    lastSyncedFilesRef.current = {};
    currentDrawingVersionRef.current = null;
    lastPersistedElementsRef.current = [];
    suspiciousBlankLoadRef.current = false;
    hasSceneChangesSinceLoadRef.current = false;
    excalidrawAPI.current = null;
    setIsReady(false);
    setIsSceneLoading(true);
    setLoadError(null);
    setInitialData(null);

    const loadData = async () => {
      if (!id) {
        setInitialData(buildEmptyScene());
        setIsSceneLoading(false);
        return;
      }
      try {
        const [data, libraryItems] = await Promise.all([
          api.getDrawing(id),
          api.getLibrary().catch((err) => {
            console.warn('Failed to load library, using empty:', err);
            return [];
          })
        ]);
        setDrawingName(data.name);

        const elements = data.elements || [];
        const files = data.files || {};
        const hasPreview = typeof data.preview === "string" && data.preview.trim().length > 0;
        const loadedRenderable = hasRenderableElements(elements);
        suspiciousBlankLoadRef.current = !loadedRenderable && hasPreview;
        hasSceneChangesSinceLoadRef.current = false;
        console.log("[Editor] Loaded drawing", {
          drawingId: id,
          elementCount: elements.length,
          loadedRenderable,
          hasPreview,
          version: data.version ?? null,
          suspiciousBlankLoad: suspiciousBlankLoadRef.current,
        });
        latestElementsRef.current = elements;
        initialSceneElementsRef.current = elements;
        latestFilesRef.current = files;
        lastSyncedFilesRef.current = files;
        currentDrawingVersionRef.current = typeof data.version === "number" ? data.version : null;
        lastPersistedElementsRef.current = elements;

        elements.forEach((el: any) => {
          recordElementVersion(el);
        });

        const persistedAppState = data.appState || {};
        const hydratedAppState = {
          ...persistedAppState,
          viewBackgroundColor: persistedAppState.viewBackgroundColor ?? '#ffffff',
          gridSize: persistedAppState.gridSize ?? null,
          collaborators: new Map(),
        };
        // Ensure we always have an appState available for file-only persistence triggers
        // (some Excalidraw file updates may not trigger onChange with appState).
        latestAppStateRef.current = hydratedAppState;

        setInitialData({
          elements,
          appState: hydratedAppState,
          files,
          scrollToContent: true,
          libraryItems,
        });
      } catch (err) {
        console.error('Failed to load drawing', err);
        let message = "Failed to load drawing";
        if (api.isAxiosError(err)) {
          const responseMessage =
            typeof err.response?.data?.message === "string"
              ? err.response.data.message
              : null;
          if (responseMessage) {
            message = responseMessage;
          } else if (err.response?.status === 403) {
            message = "You do not have access to this drawing";
          } else if (err.response?.status === 404) {
            message = "Drawing not found";
          }
        }
        toast.error(message);
        latestElementsRef.current = [];
        initialSceneElementsRef.current = [];
        latestFilesRef.current = {};
        lastSyncedFilesRef.current = {};
        currentDrawingVersionRef.current = null;
        lastPersistedElementsRef.current = [];
        suspiciousBlankLoadRef.current = false;
        hasSceneChangesSinceLoadRef.current = false;
        setLoadError(message);
        setInitialData(null);
      } finally {
        setIsSceneLoading(false);
      }
    };
    loadData();
  }, [id, recordElementVersion, buildEmptyScene]);

  // Hijack Ctrl+S to save immediately
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (excalidrawAPI.current && saveDataRef.current && savePreviewRef.current) {
          const elements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
          const {
            snapshot: safeElements,
            prevented,
            staleEmptySnapshot,
            staleNonRenderableSnapshot,
          } = resolveSafeSnapshot(elements);
          const appState = excalidrawAPI.current.getAppState();
          const files = excalidrawAPI.current.getFiles() || {};
          latestFilesRef.current = files;
          if (prevented) {
            console.warn("[Editor] Prevented stale Ctrl+S snapshot overwrite", {
              drawingId: id,
              staleEmptySnapshot,
              staleNonRenderableSnapshot,
              candidateElementCount: elements.length,
              fallbackElementCount: safeElements.length,
            });
          }
          if (!id) return;
          await enqueueSceneSave(id, safeElements, appState, files);
          savePreviewRef.current(id, safeElements, appState, files);
          toast.success("Saved changes to server");
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enqueueSceneSave, id, resolveSafeSnapshot]);

  const handleCanvasChange = useCallback((elements: readonly any[], appState: any, files?: Record<string, any>) => {
    if (isUnmounting.current) {
      console.log("[Editor] Ignoring change during unmount", { drawingId: id });
      return;
    }

    if (isSyncing.current) return;

    latestAppStateRef.current = appState;

    const currentFiles = files || excalidrawAPI.current?.getFiles() || {};
    if (Object.keys(currentFiles).length > 0) {
      latestFilesRef.current = currentFiles;
    }

    // Get ALL elements including deleted (fixes the "deletion not syncing" bug)
    const allElements = excalidrawAPI.current
      ? excalidrawAPI.current.getSceneElementsIncludingDeleted()
      : elements;

    if (!hasHydratedInitialScene.current) {
      const matchesInitialSnapshot = haveSameElements(
        allElements,
        initialSceneElementsRef.current
      );
      const transientHydrationEmpty = isSuspiciousEmptySnapshot(
        initialSceneElementsRef.current,
        allElements
      );
      const transientHydrationNonRenderable = isStaleNonRenderableSnapshot(
        initialSceneElementsRef.current,
        allElements
      );

      if (transientHydrationEmpty || transientHydrationNonRenderable) {
        console.log("[Editor] Skipping transient hydration snapshot", {
          drawingId: id,
          elementCount: allElements.length,
          transientHydrationEmpty,
          transientHydrationNonRenderable,
        });
        return;
      }

      hasHydratedInitialScene.current = true;
      isBootstrappingScene.current = false;

      if (matchesInitialSnapshot) {
        console.log("[Editor] Skipping hydration change", {
          drawingId: id,
          elementCount: allElements.length,
        });
        return;
      }

      console.log("[Editor] First live change after hydration", {
        drawingId: id,
        elementCount: allElements.length,
      });
    }

    const noFileChanges =
      Object.keys(getFilesDelta(latestFilesRef.current || {}, currentFiles || {})).length === 0;
    if (haveSameElements(allElements, latestElementsRef.current) && noFileChanges) {
      return;
    }

    const {
      prevented: preventedCanvasOverwrite,
      staleEmptySnapshot: staleEmptyCanvasSnapshot,
      staleNonRenderableSnapshot: staleNonRenderableCanvasSnapshot,
    } = resolveSafeSnapshot(allElements);
    if (preventedCanvasOverwrite) {
      console.warn("[Editor] Skipping stale non-renderable change", {
        drawingId: id,
        elementCount: allElements.length,
        staleEmptyCanvasSnapshot,
        staleNonRenderableCanvasSnapshot,
      });
      return;
    }

    const hasRenderable = hasRenderableElements(allElements);
    if (hasRenderable && suspiciousBlankLoadRef.current) {
      suspiciousBlankLoadRef.current = false;
      console.log("[Editor] Cleared suspicious blank load guard after renderable edit", {
        drawingId: id,
        elementCount: allElements.length,
      });
    }
    if (isBootstrappingScene.current && !hasRenderable) {
      console.log("[Editor] Bootstrapping guard active", {
        drawingId: id,
        elementCount: allElements.length,
      });
      return;
    }
    latestElementsRef.current = allElements;
    hasSceneChangesSinceLoadRef.current = true;

    // Trigger Sync (Throttled)
    broadcastChanges(allElements, currentFiles);

    const filesSnapshot = currentFiles;
    latestFilesRef.current = filesSnapshot;

    // Trigger Fast Save
    console.log("[Editor] Queueing save", {
      drawingId: id,
      elementCount: allElements.length,
      hasRenderableElements: hasRenderable,
    });
    if (id) {
      debouncedSave(id, allElements, appState, filesSnapshot);
    }

    // Trigger Slow Preview Gen
    console.log("[Editor] Queueing preview save", {
      drawingId: id,
      fileCount: Object.keys(filesSnapshot).length,
    });
    if (id) {
      debouncedSavePreview(id, allElements, appState, filesSnapshot);
    }
  }, [debouncedSave, debouncedSavePreview, broadcastChanges, id, resolveSafeSnapshot]);

  // Ensure file-only updates (e.g. pasted image dataURL arriving asynchronously)
  // are still broadcast to collaborators AND persisted to the server.
  useEffect(() => {
    if (!id || !isReady) return;

    const interval = window.setInterval(() => {
      if (isUnmounting.current) return;
      if (isSyncing.current) return;
      if (!socketRef.current) return;
      if (!excalidrawAPI.current) return;

      const nextFiles = excalidrawAPI.current.getFiles?.() || {};
      const didEmit = emitFilesDeltaIfNeeded(nextFiles);

      // Persist after file data becomes available (covers the "tab 3" case).
      if (didEmit && latestAppStateRef.current && debouncedSaveRef.current) {
        hasSceneChangesSinceLoadRef.current = true;
        debouncedSaveRef.current(id, latestElementsRef.current, latestAppStateRef.current, nextFiles);
        if (savePreviewRef.current) {
          void savePreviewRef.current(
            id,
            latestElementsRef.current,
            latestAppStateRef.current,
            nextFiles
          );
        }
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [id, isReady, emitFilesDeltaIfNeeded]);

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && id) {
      setDrawingName(newName);
      setIsRenaming(false);
      try {
        await api.updateDrawing(id, { name: newName });
      } catch (err) {
        console.error("Failed to rename", err);
      }
    }
  };

  // Handle library changes and persist to server
  const handleLibraryChange = useCallback((items: readonly any[]) => {
    console.log("[Editor] Library changed", { itemCount: items.length });
    debouncedSaveLibrary([...items]);
  }, [debouncedSaveLibrary]);

  // Disable native Excalidraw save dialogs

  const handleBackClick = async () => {
    if (isSavingOnLeave) return; // Prevent double clicks

    setIsSavingOnLeave(true);
    let shouldNavigate = false;

    // Save drawing and generate preview before navigating
    try {
      if (!(excalidrawAPI.current && saveDataRef.current && savePreviewRef.current)) {
        // If editor API is not ready, allow navigation instead of trapping the user.
        shouldNavigate = true;
      } else if (!hasSceneChangesSinceLoadRef.current) {
        console.log("[Editor] Skipping back-navigation save: no scene changes since load", {
          drawingId: id,
        });
        shouldNavigate = true;
      } else if (!id) {
        shouldNavigate = true;
      } else {
        const elements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const {
          snapshot: safeElements,
          prevented,
          staleEmptySnapshot,
          staleNonRenderableSnapshot,
        } = resolveSafeSnapshot(elements);
        const appState = excalidrawAPI.current.getAppState();
        const files = excalidrawAPI.current.getFiles() || {};
        latestFilesRef.current = files;
        if (prevented) {
          console.warn("[Editor] Prevented stale back-navigation snapshot overwrite", {
            drawingId: id,
            staleEmptySnapshot,
            staleNonRenderableSnapshot,
            candidateElementCount: elements.length,
            fallbackElementCount: safeElements.length,
          });
        }
        if (suspiciousBlankLoadRef.current && !hasRenderableElements(safeElements)) {
          console.warn("[Editor] Blocking back-navigation save due to suspicious blank load", {
            drawingId: id,
            elementCount: safeElements.length,
          });
          toast.warning("Blank scene detected on load. Skipping save to protect existing data.");
          shouldNavigate = true;
        } else {
          await Promise.all([
            enqueueSceneSave(id, safeElements, appState, files, { suppressErrors: false }),
            savePreviewRef.current(id, safeElements, appState, files)
          ]);
          console.log("[Editor] Saved on back navigation", { drawingId: id });
          shouldNavigate = true;
        }
      }
    } catch (err) {
      console.error('Failed to save on back navigation', err);
      toast.error("Failed to save changes. Please retry before leaving.");
    } finally {
      setIsSavingOnLeave(false);
    }
    if (shouldNavigate) {
      navigate('/');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
      <header 
        className={clsx(
          "h-16 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 flex items-center px-4 justify-between z-10 fixed top-0 left-0 right-0 transition-transform duration-300",
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        )}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackClick}
            disabled={isSavingOnLeave}
            className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-wait transition-all duration-200 ${isSavingOnLeave ? 'pr-4' : ''}`}
          >
            {isSavingOnLeave ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm font-medium">Saving changes...</span>
              </>
            ) : (
              <ArrowLeft size={20} />
            )}
          </button>

          {isRenaming ? (
            <form onSubmit={handleRenameSubmit}>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => setIsRenaming(false)}
                className="font-medium text-gray-900 dark:text-white bg-transparent px-2 py-1 border-2 border-indigo-500 rounded-md outline-none min-w-[200px]"
                style={{ width: `${Math.max(200, newName.length * 9 + 20)}px` }}
              />
            </form>
          ) : (
            <h1
              className="font-medium text-gray-900 dark:text-white px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded cursor-text"
              onDoubleClick={() => { setNewName(drawingName); setIsRenaming(true); }}
            >
              {drawingName}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-hide Toggle */}
          <button
            onClick={() => {
              setAutoHideEnabled(!autoHideEnabled);
              if (!autoHideEnabled) {
                setIsHeaderVisible(true);
              }
            }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
            title={autoHideEnabled ? "Disable auto-hide" : "Enable auto-hide"}
          >
            {autoHideEnabled ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />

          {/* Download Button */}
          <button
            onClick={() => {
              if (excalidrawAPI.current) {
                const elements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
                const appState = excalidrawAPI.current.getAppState();
                const files = excalidrawAPI.current.getFiles() || {};
                exportFromEditor(drawingName, elements, appState, files);
                toast.success('Drawing exported');
              }
            }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
            title="Export drawing"
          >
            <Download size={20} />
          </button>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />

          <div className="flex items-center">
            <div className="relative group">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: me.color }}
              >
                {me.initials}
              </div>
              <div className="absolute top-full mt-2 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {me.name} (You)
              </div>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />

            <div className="flex items-center gap-2">
              {peers.map(peer => (
                <div
                  key={peer.id}
                  className="relative group"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm transition-all duration-300 ${!peer.isActive ? 'opacity-30 grayscale' : ''}`}
                    style={{ backgroundColor: peer.color }}
                  >
                    {peer.initials}
                  </div>
                  <div className="absolute top-full mt-2 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    {peer.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div 
        className="flex-1 w-full relative transition-all duration-300" 
        style={{ 
          height: isHeaderVisible ? 'calc(100vh - 4rem)' : '100vh',
          marginTop: isHeaderVisible ? '4rem' : '0'
        }}
      >
        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Unable to open drawing
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {loadError}
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Back to dashboard
            </button>
          </div>
        ) : initialData ? (
          <Excalidraw
            key={id}
            theme={theme === 'dark' ? 'dark' : 'light'}
            initialData={initialData}
            onChange={handleCanvasChange}
            onPointerUpdate={onPointerUpdate}
            onLibraryChange={handleLibraryChange}
            excalidrawAPI={setExcalidrawAPI}
            UIOptions={UIOptions}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <span className="text-sm font-medium">
              {isSceneLoading ? 'Loading drawing...' : 'Preparing canvas...'}
            </span>
          </div>
        )}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
};
