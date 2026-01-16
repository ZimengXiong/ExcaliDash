import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import { Toaster, toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import { getUserIdentity } from '../utils/identity';
import { reconcileElements } from '../utils/sync';
import { exportFromEditor } from '../utils/exportUtils';
import type { UserIdentity } from '../utils/identity';
import * as api from '../api';
import { useTheme } from '../context/ThemeContext';

interface Peer extends UserIdentity {
  isActive: boolean;
}

interface ElementVersionInfo {
  version: number;
  versionNonce: number;
}

const haveSameElements = (a: readonly any[] = [], b: readonly any[] = []) => {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.id !== right.id) return false;
    if ((left.version ?? 0) !== (right.version ?? 0)) return false;
    if ((left.versionNonce ?? 0) !== (right.versionNonce ?? 0)) return false;
  }
  return true;
};

const buildFileSignature = (file: any): string => {
  const mimeType = typeof file?.mimeType === "string" ? file.mimeType : "";
  const id = typeof file?.id === "string" ? file.id : "";
  const dataURL = typeof file?.dataURL === "string" ? file.dataURL : "";
  // Avoid keeping the whole dataURL for comparisons; use a cheap signature.
  const prefix = dataURL.slice(0, 32);
  const suffix = dataURL.slice(-32);
  return `${id}|${mimeType}|${dataURL.length}|${prefix}|${suffix}`;
};

const getFilesDelta = (
  previous: Record<string, any>,
  next: Record<string, any>
): Record<string, any> => {
  const delta: Record<string, any> = {};
  const prev = previous || {};
  const nxt = next || {};

  for (const fileId of Object.keys(nxt)) {
    const nextFile = nxt[fileId];
    const nextHasDataUrl = typeof nextFile?.dataURL === "string" && nextFile.dataURL.length > 0;
    // Only sync files that actually have data; otherwise other tabs can't render yet.
    if (!nextHasDataUrl) continue;

    const prevFile = prev[fileId];
    if (!prevFile) {
      delta[fileId] = nextFile;
      continue;
    }

    if (buildFileSignature(prevFile) !== buildFileSignature(nextFile)) {
      delta[fileId] = nextFile;
    }
  }

  return delta;
};

const UIOptions = {
  canvasActions: {
    saveToActiveFile: false,
    loadScene: false,
    export: { saveFileToDisk: false },
    toggleTheme: true,
  },
};

export const Editor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [drawingName, setDrawingName] = useState('Drawing Editor');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [initialData, setInitialData] = useState<any>(null);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);

  useEffect(() => {
    document.title = `${drawingName} - ExcaliDash`;
    return () => {
      document.title = 'ExcaliDash';
    };
  }, [drawingName]);

  const [peers, setPeers] = useState<Peer[]>([]);
  const [me] = useState(getUserIdentity());
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
  const latestFilesRef = useRef<any>(null);
  const lastSyncedFilesRef = useRef<Record<string, any>>({});
  const latestAppStateRef = useRef<any>(null);
  const debouncedSaveRef = useRef<((elements: readonly any[], appState: any) => void) | null>(null);

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

    const socketUrl = import.meta.env.VITE_API_URL === '/api'
      ? window.location.origin
      : (import.meta.env.VITE_API_URL || 'http://localhost:8000');

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
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
        avatarUrl: data.avatarUrl,
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
        excalidrawAPI.current.addFiles(incomingFiles);
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
    if (api && typeof api.addFiles === "function") {
      const originalAddFiles = api.addFiles.bind(api);
      api.addFiles = (files: Record<string, any>) => {
        originalAddFiles(files);

        // Avoid rebroadcast loops when we are applying remote updates.
        if (isSyncing.current) return;

        const nextFiles = api.getFiles?.() || {};
        const didEmit = emitFilesDeltaIfNeeded(nextFiles);

        // Persist after file data becomes available so new tabs (tab3) load correctly.
        if (didEmit && latestAppStateRef.current && debouncedSaveRef.current) {
          debouncedSaveRef.current(latestElementsRef.current, latestAppStateRef.current);
        }
      };
    }
    setIsReady(true);
  }, [emitFilesDeltaIfNeeded]);

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

  const saveDataRef = useRef<((elements: readonly any[], appState: any) => Promise<void>) | null>(null);
  const savePreviewRef = useRef<((elements: readonly any[], appState: any, files: any) => Promise<void>) | null>(null);
  const saveLibraryRef = useRef<((items: any[]) => Promise<void>) | null>(null);

  saveDataRef.current = async (elements: readonly any[], appState: any) => {
    if (!id) return;

    try {
      const persistableAppState = {
        viewBackgroundColor: appState?.viewBackgroundColor || '#ffffff',
        gridSize: appState?.gridSize || null,
      };

      const snapshot = latestElementsRef.current ?? elements ?? [];
      const persistableElements = Array.isArray(snapshot) ? snapshot : [];

      console.log("[Editor] Saving drawing", {
        drawingId: id,
        elementCount: persistableElements.length,
        hasRenderableElements: persistableElements.some((el: any) => !el?.isDeleted),
        appState: persistableAppState,
      });

      await api.updateDrawing(id, {
        elements: persistableElements,
        appState: persistableAppState,
        files: latestFilesRef.current || {},
      });

      console.log("[Editor] Save complete", { drawingId: id });
    } catch (err) {
      console.error('Failed to save drawing', err);
      toast.error("Failed to save changes");
    }
  };

  savePreviewRef.current = async (elements: readonly any[], appState: any, files: any) => {
    if (!id) return;

    try {
      const currentSnapshot = latestElementsRef.current ?? elements;
      const currentFiles = latestFilesRef.current ?? files;

      const svg = await exportToSvg({
        elements: currentSnapshot,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
        },
        files: currentFiles,
      });
      const preview = svg.outerHTML;

      console.log("[Editor] Saving preview", {
        drawingId: id,
        elementCount: currentSnapshot.length,
      });

      await api.updateDrawing(id, { preview });

      console.log("[Editor] Preview save complete", { drawingId: id });
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
    debounce((elements, appState) => {
      if (saveDataRef.current) {
        saveDataRef.current(elements, appState);
      }
    }, 1000),
    [] // Empty dependency array = Stable across renders
  );
  // Allow non-hook code (e.g., Excalidraw API wrappers) to trigger debounced saves.
  debouncedSaveRef.current = debouncedSave;
  const debouncedSavePreview = useCallback(
    debounce((elements, appState, files) => {
      if (savePreviewRef.current) {
        savePreviewRef.current(elements, appState, files);
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
    latestElementsRef.current = [];
    latestFilesRef.current = {};
    lastSyncedFilesRef.current = {};
    excalidrawAPI.current = null;
    setIsReady(false);
    setIsSceneLoading(true);
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
        latestElementsRef.current = elements;
        latestFilesRef.current = files;
        lastSyncedFilesRef.current = files;

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
        toast.error("Failed to load drawing");
        latestElementsRef.current = [];
        latestFilesRef.current = {};
        lastSyncedFilesRef.current = {};
        setInitialData(buildEmptyScene());
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
          const appState = excalidrawAPI.current.getAppState();
          const files = excalidrawAPI.current.getFiles() || {};
          latestElementsRef.current = elements;
          latestFilesRef.current = files;
          await saveDataRef.current(elements, appState);
          savePreviewRef.current(elements, appState, files);
          toast.success("Saved changes to server");
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      const matchesInitialSnapshot = haveSameElements(allElements, latestElementsRef.current);
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

    latestElementsRef.current = allElements;

    const hasRenderableElements = allElements.some((el: any) => !el?.isDeleted);
    if (isBootstrappingScene.current && !hasRenderableElements) {
      console.log("[Editor] Bootstrapping guard active", {
        drawingId: id,
        elementCount: allElements.length,
      });
      return;
    }

    // Trigger Sync (Throttled)
    broadcastChanges(allElements, currentFiles);

    // Trigger Fast Save
    console.log("[Editor] Queueing save", {
      drawingId: id,
      elementCount: allElements.length,
      hasRenderableElements,
    });
    debouncedSave(allElements, appState);

    // Trigger Slow Preview Gen
    const filesSnapshot = currentFiles;
    latestFilesRef.current = filesSnapshot;
    console.log("[Editor] Queueing preview save", {
      drawingId: id,
      fileCount: Object.keys(filesSnapshot).length,
    });
    debouncedSavePreview(allElements, appState, filesSnapshot);
  }, [debouncedSave, debouncedSavePreview, broadcastChanges]);

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
        debouncedSaveRef.current(latestElementsRef.current, latestAppStateRef.current);
      }
    }, 500);

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

    // Save drawing and generate preview before navigating
    try {
      if (excalidrawAPI.current && saveDataRef.current && savePreviewRef.current) {
        const elements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const appState = excalidrawAPI.current.getAppState();
        const files = excalidrawAPI.current.getFiles() || {};
        latestElementsRef.current = elements;
        latestFilesRef.current = files;

        await Promise.all([
          saveDataRef.current(elements, appState),
          savePreviewRef.current(elements, appState, files)
        ]);
        console.log("[Editor] Saved on back navigation", { drawingId: id });
      }
    } catch (err) {
      console.error('Failed to save on back navigation', err);
    } finally {
      setIsSavingOnLeave(false);
    }
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
      <header className="h-14 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 flex items-center px-4 justify-between z-10">
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

      <div className="flex-1 w-full relative" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {initialData ? (
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
