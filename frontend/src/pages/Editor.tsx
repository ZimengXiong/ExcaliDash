import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, ChevronUp, ChevronDown, Share2 } from 'lucide-react';
import clsx from 'clsx';
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToSvg,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import { Toaster, toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import type { UserIdentity } from '../utils/identity';
import { useAuth } from '../context/AuthContext';
import { exportFromEditor } from '../utils/exportUtils';
import * as api from '../api';
import { useTheme } from '../context/ThemeContext';
import {
  buildRemoteSceneUpdate,
  getPersistedAppState,
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
import { ShareModal } from '../components/ShareModal';

interface Peer extends UserIdentity {
  isActive: boolean;
}

const MULTI_IMAGE_DROP_GAP = 25;

type DroppedImageData = {
  fileId: string;
  mimeType: string;
  dataURL: string;
  created: number;
  width: number;
  height: number;
};

const toFiniteNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const createDroppedFileId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `dropped-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isSupportedDroppedImageFile = (file: File): boolean => {
  if (typeof file?.type === "string" && file.type.startsWith("image/")) {
    return true;
  }

  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file?.name || "");
};

const getDroppedImageFiles = (dataTransfer?: DataTransfer | null): File[] =>
  Array.from(dataTransfer?.files || []).filter(isSupportedDroppedImageFile);

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read image file"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });

const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth || image.width || 1)),
        height: Math.max(1, Math.round(image.naturalHeight || image.height || 1)),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode dropped image"));
    };
    image.src = objectUrl;
  });

const loadDroppedImageData = async (file: File): Promise<DroppedImageData> => {
  const [dataURL, dimensions] = await Promise.all([
    readFileAsDataURL(file),
    getImageDimensions(file),
  ]);

  return {
    fileId: createDroppedFileId(),
    mimeType: file.type || "application/octet-stream",
    dataURL,
    created: Date.now(),
    width: dimensions.width,
    height: dimensions.height,
  };
};

// Content-based signature for detecting "live" changes even when Excalidraw doesn't
// bump version/versionNonce/updated until commit (e.g. during shape creation drags).
const getElementContentSig = (element: any): string => {
  if (!element || typeof element !== "object") return "";

  const type = typeof element.type === "string" ? element.type : "";
  const isDeleted = element.isDeleted ? "1" : "0";
  const status = typeof element.status === "string" ? element.status : "";
  const x = toFiniteNumber(element.x);
  const y = toFiniteNumber(element.y);
  const w = toFiniteNumber(element.width);
  const h = toFiniteNumber(element.height);
  const angle = toFiniteNumber(element.angle);

  const fileId = typeof element.fileId === "string" ? element.fileId : "";
  const text = typeof element.text === "string" ? element.text : "";
  const textSig = text ? `t${text.length}:${text.slice(0, 64)}` : "";

  let pointsSig = "";
  if (Array.isArray(element.points)) {
    const pts = element.points as any[];
    const len = pts.length;
    const last = len > 0 ? pts[len - 1] : null;
    const lastX = Array.isArray(last) ? toFiniteNumber(last[0]) : 0;
    const lastY = Array.isArray(last) ? toFiniteNumber(last[1]) : 0;
    pointsSig = `p${len}:${lastX},${lastY}`;
  }

  return `${type}|${isDeleted}|${status}|${x}|${y}|${w}|${h}|${angle}|${pointsSig}|${fileId}|${textSig}`;
};

class DrawingSaveConflictError extends Error {
  constructor(message = "Drawing version conflict") {
    super(message);
    this.name = "DrawingSaveConflictError";
  }
}

export const Editor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user } = useAuth();
  const autoHideStorageKey = id ? `excalidash:editor:${id}:autoHideEnabled` : null;
  const getStoredAutoHideEnabled = useCallback((): boolean => {
    if (!autoHideStorageKey) return true;
    try {
      const raw = window.localStorage.getItem(autoHideStorageKey);
      if (raw === null) return true;
      return raw === "1" || raw === "true";
    } catch {
      return true;
    }
  }, [autoHideStorageKey]);
  const [accessLevel, setAccessLevel] = useState<"none" | "view" | "edit" | "owner">("none");
  const canEdit = accessLevel === "edit" || accessLevel === "owner";
  const [drawingName, setDrawingName] = useState('Drawing Editor');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [initialData, setInitialData] = useState<any>(null);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);
  const [autoHideEnabled, setAutoHideEnabled] = useState(getStoredAutoHideEnabled);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const { isHeaderVisible, setIsHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled,
    isRenaming,
  });
  const me: UserIdentity = useEditorIdentity(user);
  // The server can override the identity id (notably for share-link sessions) to prevent spoofing.
  // Keep a "socket identity" in sync with what the server considers canonical, so we don't render ourselves twice.
  const [socketMe, setSocketMe] = useState<UserIdentity>(me);
  const socketMeRef = useRef<UserIdentity>(socketMe);
  const lastPresenceUsersRef = useRef<Peer[] | null>(null);

  useEffect(() => {
    setSocketMe(me);
  }, [me.id, me.name, me.initials, me.color]);

  useEffect(() => {
    socketMeRef.current = socketMe;
  }, [socketMe]);

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
  const lastSyncedElementOrderSigRef = useRef<string>("");
  const lastPersistedFilesRef = useRef<Record<string, any>>({});
  const latestAppStateRef = useRef<any>(null);
  const debouncedSaveRef = useRef<((drawingId: string, elements: readonly any[], appState: any, files?: Record<string, any>) => void) | null>(null);
  const currentDrawingVersionRef = useRef<number | null>(null);
  const lastPersistedElementsRef = useRef<readonly any[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const patchedAddFilesApisRef = useRef<WeakSet<object>>(new WeakSet());
  const suspiciousBlankLoadRef = useRef(false);
  const hasSceneChangesSinceLoadRef = useRef(false);
  const lastLocalChangeAtRef = useRef<number>(0);
  const pendingRemoteElementsRef = useRef<Map<string, any>>(new Map());
  const pendingRemoteFilesRef = useRef<Record<string, any>>({});
  const pendingRemoteElementOrderRef = useRef<string[] | null>(null);
  const remoteFlushScheduledRef = useRef(false);
  const remoteFlushRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    setAutoHideEnabled(getStoredAutoHideEnabled());
  }, [getStoredAutoHideEnabled]);

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
        userId: socketMeRef.current.id,
      });

      return true;
    },
    [id]
  );

  const recordElementVersion = useCallback((element: any) => {
    elementVersionMap.current.set(element.id, {
      version: element.version ?? 0,
      versionNonce: element.versionNonce ?? 0,
      updated:
        typeof element?.updated === "number"
          ? element.updated
          : Number(element?.updated) || 0,
      contentSig: getElementContentSig(element),
    });
  }, []);

  const hasElementChanged = useCallback((element: any) => {
    const previous = elementVersionMap.current.get(element.id);
    if (!previous) return true;

    const nextVersion = element.version ?? 0;
    const nextNonce = element.versionNonce ?? 0;
    const nextUpdated =
      typeof element?.updated === "number"
        ? element.updated
        : Number(element?.updated) || 0;
    const nextSig = getElementContentSig(element);

    return (
      previous.version !== nextVersion ||
      previous.versionNonce !== nextNonce ||
      previous.updated !== nextUpdated ||
      previous.contentSig !== nextSig
    );
  }, []);

  const computeElementOrderSig = useCallback((elements: readonly any[]) => {
    // Hash element ID order so we can detect layer reorder operations that don't
    // bump element version fields.
    let hash = 2166136261; // FNV-1a 32-bit offset basis
    let count = 0;
    for (const el of elements) {
      const id = typeof el?.id === "string" ? el.id : "";
      if (!id) continue;
      count += 1;
      for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      // Delimiter so ["ab","c"] != ["a","bc"]
      hash ^= 124; // '|'
      hash = Math.imul(hash, 16777619);
    }
    return `${count}:${(hash >>> 0).toString(16)}`;
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
      : (import.meta.env.VITE_API_URL || import.meta.env.VITE_DEV_BACKEND_URL || 'http://localhost:8000');

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

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

    socket.emit('join-room', { drawingId: id, user: me }, (payload: any) => {
      const serverUser = payload?.user;
      if (!serverUser || typeof serverUser.id !== "string") return;
      const next: UserIdentity = {
        id: serverUser.id,
        name: typeof serverUser.name === "string" ? serverUser.name : me.name,
        initials: typeof serverUser.initials === "string" ? serverUser.initials : me.initials,
        color: typeof serverUser.color === "string" ? serverUser.color : me.color,
      };
      socketMeRef.current = next;
      setSocketMe(next);
      const lastUsers = lastPresenceUsersRef.current;
      if (lastUsers) {
        setPeers(lastUsers.filter((u) => u.id !== next.id));
      }
    });

    const renderLoop = () => {
      if (cursorBuffer.current.size > 0 && excalidrawAPI.current) {
        const collaborators = new Map<string, any>(
          excalidrawAPI.current.getAppState().collaborators || []
        );

        cursorBuffer.current.forEach((data, userId) => {
          collaborators.set(userId, data);
        });

        cursorBuffer.current.clear();
        const { sceneUpdate } = buildRemoteSceneUpdate({ collaborators });
        if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }
      }
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    socket.on('presence-update', (users: Peer[]) => {
      lastPresenceUsersRef.current = users;
      const selfId = socketMeRef.current.id;
      setPeers(users.filter(u => u.id !== selfId));

      if (excalidrawAPI.current) {
        const collaborators = new Map<string, any>(
          excalidrawAPI.current.getAppState().collaborators || []
        );
        users.forEach(user => {
          if (!user.isActive && user.id !== selfId) {
            collaborators.delete(user.id);
          }
        });
        const { sceneUpdate } = buildRemoteSceneUpdate({ collaborators });
        if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }
      }
    });

    socket.on("error", (payload: any) => {
      const message = typeof payload?.message === "string" ? payload.message : null;
      console.warn("[Editor] Socket error:", payload);
      // If someone opens a link-shared drawing via the normal editor URL while signed in,
      // backend policy may still allow access via the public editor route (`/shared/:id`).
      // Prefer redirecting over showing a hard denial.
      if (
        message === "You do not have access to this drawing" &&
        id &&
        location.pathname.startsWith("/editor/")
      ) {
        navigate(`/shared/${id}${location.search}${location.hash}`, { replace: true });
        return;
      }
      if (message) toast.error(message);
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

    const hasNonEmptyArray = (value: unknown): value is any[] =>
      Array.isArray(value) && value.length > 0;

    const flushRemoteUpdates = () => {
      remoteFlushScheduledRef.current = false;
      remoteFlushRafIdRef.current = null;
      if (!excalidrawAPI.current) return;

      const hasPendingElements = pendingRemoteElementsRef.current.size > 0;
      const hasPendingFiles = Object.keys(pendingRemoteFilesRef.current || {}).length > 0;
      const pendingOrderRaw = pendingRemoteElementOrderRef.current;
      const hasPendingOrder = hasNonEmptyArray(pendingOrderRaw);
      if (!hasPendingElements && !hasPendingFiles && !hasPendingOrder) {
        return;
      }

      isSyncing.current = true;
      try {
        const pendingElements = Array.from(pendingRemoteElementsRef.current.values());
        pendingRemoteElementsRef.current.clear();

        const incomingFiles = pendingRemoteFilesRef.current || {};
        pendingRemoteFilesRef.current = {};

        const elementOrder = hasPendingOrder ? (pendingOrderRaw as string[]) : null;
        pendingRemoteElementOrderRef.current = null;

        const {
          sceneUpdate,
          mergedElements,
          nextFiles,
          shouldUpdateFiles,
        } = buildRemoteSceneUpdate({
          localElements: excalidrawAPI.current.getSceneElementsIncludingDeleted(),
          pendingElements,
          elementOrder,
          lastSyncedFiles: lastSyncedFilesRef.current,
          incomingFiles,
        });

        if (shouldUpdateFiles && typeof excalidrawAPI.current.addFiles === "function") {
          excalidrawAPI.current.addFiles(Object.values(incomingFiles));
        }

        if (mergedElements) {
          if (elementOrder) {
            lastSyncedElementOrderSigRef.current = computeElementOrderSig(mergedElements);
          }
          pendingElements.forEach((el: any) => {
            recordElementVersion(el);
          });

          if (sceneUpdate) {
            excalidrawAPI.current.updateScene(sceneUpdate);
          }
          latestElementsRef.current = mergedElements;
        } else if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }

        if (shouldUpdateFiles) {
          latestFilesRef.current = nextFiles;
          lastSyncedFilesRef.current = nextFiles;
        }
      } finally {
        isSyncing.current = false;
      }

      const moreElements = pendingRemoteElementsRef.current.size > 0;
      const moreFiles = Object.keys(pendingRemoteFilesRef.current || {}).length > 0;
      const moreOrder = hasNonEmptyArray(pendingRemoteElementOrderRef.current);
      if (moreElements || moreFiles || moreOrder) {
        if (!remoteFlushScheduledRef.current) {
          remoteFlushScheduledRef.current = true;
          remoteFlushRafIdRef.current = requestAnimationFrame(flushRemoteUpdates);
        }
      }
    };

    const scheduleRemoteFlush = () => {
      if (remoteFlushScheduledRef.current) return;
      remoteFlushScheduledRef.current = true;
      remoteFlushRafIdRef.current = requestAnimationFrame(flushRemoteUpdates);
    };

    socket.on(
      "element-update",
      ({
        elements,
        files,
        elementOrder,
      }: {
        elements: any[];
        files?: Record<string, any>;
        elementOrder?: string[];
      }) => {
        if (Array.isArray(elements)) {
          for (const el of elements) {
            const id = el?.id;
            if (typeof id === "string" && id.length > 0) {
              pendingRemoteElementsRef.current.set(id, el);
            }
          }
        }

        if (files && typeof files === "object") {
          pendingRemoteFilesRef.current = {
            ...pendingRemoteFilesRef.current,
            ...files,
          };
        }

        if (Array.isArray(elementOrder) && elementOrder.length > 0) {
          pendingRemoteElementOrderRef.current = elementOrder;
        }

        scheduleRemoteFlush();
      }
    );


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
      socket.off('error');
      socket.off('cursor-move');
      socket.off('element-update');
      socket.disconnect();
      if (remoteFlushRafIdRef.current !== null) {
        cancelAnimationFrame(remoteFlushRafIdRef.current);
        remoteFlushRafIdRef.current = null;
      }
      remoteFlushScheduledRef.current = false;
      pendingRemoteElementsRef.current.clear();
      pendingRemoteFilesRef.current = {};
      pendingRemoteElementOrderRef.current = null;
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [
    id,
    me,
    isReady,
    recordElementVersion,
    computeElementOrderSig,
    navigate,
    location.pathname,
    location.search,
    location.hash,
  ]);

  const onPointerUpdate = useCallback((payload: any) => {
    const now = Date.now();
    if (now - lastCursorEmit.current > 50 && socketRef.current) {
      const self = socketMeRef.current;
      socketRef.current.emit('cursor-move', {
        pointer: payload.pointer,
        button: payload.button,
        username: self.name,
        userId: self.id,
        drawingId: id,
        color: self.color
      });
      lastCursorEmit.current = now;
    }
  }, [id]);

  const excalidrawAPI = useRef<any>(null);

  const setExcalidrawAPI = useCallback((api: any) => {
    excalidrawAPI.current = api;
    if (import.meta.env.DEV) {
      (window as any).__EXCALIDASH_EXCALIDRAW_API__ = api;
    }

    if (api && typeof api.addFiles === "function" && !patchedAddFilesApisRef.current.has(api as object)) {
      patchedAddFilesApisRef.current.add(api as object);
      const originalAddFiles = api.addFiles.bind(api);
      api.addFiles = (filesInput: Record<string, any> | any[]) => {
        const normalizedFiles = Array.isArray(filesInput)
          ? filesInput
          : Object.values(filesInput || {});
        originalAddFiles(normalizedFiles);

        if (isSyncing.current) return;

        const nextFiles = api.getFiles?.() || {};
        const didEmit = emitFilesDeltaIfNeeded(nextFiles);

        if (didEmit && id && latestAppStateRef.current && debouncedSaveRef.current) {
          hasSceneChangesSinceLoadRef.current = true;
          debouncedSaveRef.current(id, latestElementsRef.current, latestAppStateRef.current, latestFilesRef.current || {});
        }
      };
    }
    setIsReady(true);
  }, [emitFilesDeltaIfNeeded, id]);

  useEffect(() => {
    if (!isReady || !excalidrawAPI.current) return;

    const hash = window.location.hash;
    if (!hash.includes('addLibrary=')) return;

    const params = new URLSearchParams(hash.slice(1));
    const libraryUrl = params.get('addLibrary');

    if (!libraryUrl) return;

    const importLibraryFromUrl = async () => {
      try {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(libraryUrl, window.location.href);
        } catch {
          throw new Error('Invalid library URL');
        }

        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
          throw new Error('Library URL must use http(s)');
        }

        const isLocalhost =
          parsedUrl.hostname === 'localhost' ||
          parsedUrl.hostname === '127.0.0.1' ||
          parsedUrl.hostname === '::1';

        const isCrossOrigin = parsedUrl.origin !== window.location.origin;
        if (isCrossOrigin) {
          const ok = window.confirm(
            `Import library from external site?\n\n${parsedUrl.origin}\n\nOnly continue if you trust this source.`
          );
          if (!ok) {
            toast.info('Library import canceled', { id: 'library-import' });
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            return;
          }
        }

        if (!import.meta.env.DEV && parsedUrl.protocol === 'http:' && !isLocalhost) {
          throw new Error('Insecure http:// library URL is not allowed');
        }

        console.log('[Editor] Importing library from URL:', parsedUrl.toString());
        toast.loading('Importing library...', { id: 'library-import' });

        const response = await fetch(parsedUrl.toString(), { credentials: 'omit' });
        if (!response.ok) {
          throw new Error(`Failed to fetch library: ${response.statusText}`);
        }

        const blob = await response.blob();
        if (blob.size > 10 * 1024 * 1024) {
          throw new Error('Library file is too large');
        }

        await excalidrawAPI.current.updateLibrary({
          libraryItems: blob,
          merge: true,
          defaultStatus: "published",
          openLibraryMenu: true,
        });

        const updatedItems = excalidrawAPI.current.getAppState().libraryItems || [];
        if (user) {
          await api.updateLibrary([...updatedItems]);
        }

        toast.success('Library imported successfully', { id: 'library-import' });
        console.log('[Editor] Library import complete');

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
      const persistableAppState = getPersistedAppState(appState);

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
      const filesChangedSincePersist =
        Object.keys(getFilesDelta(lastPersistedFilesRef.current || {}, persistableFiles || {}))
          .length > 0;
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
            ...(filesChangedSincePersist ? { files: persistableFiles } : {}),
            version: currentDrawingVersionRef.current ?? undefined,
          });
          if (typeof updated.version === "number") {
            currentDrawingVersionRef.current = updated.version;
          }
          lastPersistedElementsRef.current = normalizedElementsForSave;
          if (filesChangedSincePersist) {
            lastPersistedFilesRef.current = persistableFiles;
          }
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
              // Autosave is best-effort; the UI handles surfacing explicit save failures elsewhere.
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
    if (!user) return;
    try {
      console.log("[Editor] Saving library", { itemCount: items.length });
      await api.updateLibrary(items);
      console.log("[Editor] Library save complete");
    } catch (err) {
      console.error('Failed to save library', err);
      if (api.isAxiosError(err) && err.response?.status === 401) {
        // Share sessions / anonymous users can't persist library to the server.
        return;
      }
      toast.error("Failed to save library");
    }
  };


  const debouncedSave = useCallback(
    debounce((drawingId, elements, appState, files) => {
      enqueueSceneSave(drawingId, elements, appState, files);
    }, 1000),
    [enqueueSceneSave]
  );
  debouncedSaveRef.current = debouncedSave;
  const debouncedSavePreview = useCallback(
    debounce((drawingId: string) => {
      if (!savePreviewRef.current) return;
      if (!drawingId) return;
      if (isUnmounting.current) return;
      if (isSyncing.current) return;

      const expectedChangeAt = lastLocalChangeAtRef.current;
      const run = () => {
        if (!savePreviewRef.current) return;
        if (isUnmounting.current) return;
        if (isSyncing.current) return;
        if (lastLocalChangeAtRef.current !== expectedChangeAt) return;

        const elements = latestElementsRef.current;
        const appState = latestAppStateRef.current;
        const files = latestFilesRef.current || {};
        if (!appState) return;

        void savePreviewRef.current(drawingId, elements, appState, files);
      };

      const w = window as any;
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(run, { timeout: 2000 });
      } else {
        setTimeout(run, 0);
      }
    }, 30_000),
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

      const nextFiles = currentFiles || excalidrawAPI.current?.getFiles() || {};
      const normalizedElements = normalizeImageElementStatus(elements, nextFiles);

      const nextOrderSig = computeElementOrderSig(normalizedElements);
      const shouldSyncOrder = nextOrderSig !== lastSyncedElementOrderSigRef.current;
      if (shouldSyncOrder) {
        lastSyncedElementOrderSigRef.current = nextOrderSig;
      }

      normalizedElements.forEach((el) => {
        if (hasElementChanged(el)) {
          changes.push(el);
          recordElementVersion(el);
        }
      });

      const filesDelta = getFilesDelta(lastSyncedFilesRef.current, nextFiles);
      const shouldSyncFiles = Object.keys(filesDelta).length > 0;

      if (Object.keys(nextFiles || {}).length > 0) {
        latestFilesRef.current = nextFiles;
      }
      if (shouldSyncFiles) {
        lastSyncedFilesRef.current = nextFiles;
      }

      if (changes.length > 0 || shouldSyncFiles || shouldSyncOrder) {
        hasSceneChangesSinceLoadRef.current = true;
        lastLocalChangeAtRef.current = Date.now();
        socketRef.current.emit('element-update', {
          drawingId: id,
          elements: changes.length > 0 ? changes : [],
          files: shouldSyncFiles ? filesDelta : undefined,
          elementOrder: shouldSyncOrder
            ? normalizedElements.map((el: any) => el?.id).filter(Boolean)
            : undefined,
          userId: socketMeRef.current.id
        });

        const appState = latestAppStateRef.current;
        if (appState) {
          debouncedSave(id, normalizedElements, appState, nextFiles);
          debouncedSavePreview(id);
        }
      }
    }, 100, { leading: true, trailing: true }),
    [
      id,
      hasElementChanged,
      recordElementVersion,
      debouncedSave,
      debouncedSavePreview,
      computeElementOrderSig,
    ]
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
    lastSyncedElementOrderSigRef.current = "";
    lastPersistedFilesRef.current = {};
    pendingRemoteElementsRef.current.clear();
    pendingRemoteFilesRef.current = {};
    pendingRemoteElementOrderRef.current = null;
    remoteFlushScheduledRef.current = false;
    if (remoteFlushRafIdRef.current !== null) {
      cancelAnimationFrame(remoteFlushRafIdRef.current);
      remoteFlushRafIdRef.current = null;
    }
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
        const libraryItemsPromise = user
          ? api.getLibrary().catch((err) => {
              console.warn("Failed to load library, using empty:", err);
              return [];
            })
          : Promise.resolve([]);

        const [data, libraryItems] = await Promise.all([api.getDrawing(id), libraryItemsPromise]);
        setDrawingName(data.name);
        setAccessLevel(
          data.accessLevel === "view" || data.accessLevel === "edit" || data.accessLevel === "owner"
            ? data.accessLevel
            : "owner"
        );

        const elements = data.elements || [];
        const files = data.files || {};
        const hasPreview = typeof data.preview === "string" && data.preview.trim().length > 0;
        const loadedRenderable = hasRenderableElements(elements);
        suspiciousBlankLoadRef.current = !loadedRenderable && hasPreview;
        hasSceneChangesSinceLoadRef.current = false;
        if (import.meta.env.DEV) {
          console.log("[Editor] Loaded drawing", {
            drawingId: id,
            elementCount: elements.length,
            loadedRenderable,
            hasPreview,
            version: data.version ?? null,
            suspiciousBlankLoad: suspiciousBlankLoadRef.current,
          });
        }
        latestElementsRef.current = elements;
        initialSceneElementsRef.current = elements;
        latestFilesRef.current = files;
        lastSyncedFilesRef.current = files;
        lastPersistedFilesRef.current = files;
        currentDrawingVersionRef.current = typeof data.version === "number" ? data.version : null;
        lastPersistedElementsRef.current = elements;

        elements.forEach((el: any) => {
          recordElementVersion(el);
        });

        const persistedAppState = getPersistedAppState(data.appState || {});
        const hydratedAppState = {
          ...persistedAppState,
          collaborators: new Map(),
        };
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

          // When a link-shared drawing URL is opened via `/editor/:id` by a signed-in user who
          // lacks explicit ACL access, prefer bouncing to the public route (`/shared/:id`) so
          // link-share policy can apply cleanly.
          if (err.response?.status === 403 && id && location.pathname.startsWith("/editor/")) {
            navigate(`/shared/${id}${location.search}${location.hash}`, { replace: true });
            return;
          }
        }
        toast.error(message);
        latestElementsRef.current = [];
          initialSceneElementsRef.current = [];
          latestFilesRef.current = {};
          lastSyncedFilesRef.current = {};
          lastSyncedElementOrderSigRef.current = "";
          lastPersistedFilesRef.current = {};
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
  }, [
    id,
    recordElementVersion,
    buildEmptyScene,
    user,
    navigate,
    location.pathname,
    location.search,
    location.hash,
  ]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!canEdit) return;
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
  }, [enqueueSceneSave, id, resolveSafeSnapshot, canEdit]);

  const handleCanvasChange = useCallback((elements: readonly any[], appState: any, files?: Record<string, any>) => {
    if (!canEdit) return;
    if (isUnmounting.current) {
      if (import.meta.env.DEV) {
        console.log("[Editor] Ignoring change during unmount", { drawingId: id });
      }
      return;
    }

    if (isSyncing.current) return;

    latestAppStateRef.current = appState;

    const currentFiles = files || excalidrawAPI.current?.getFiles() || {};
    if (Object.keys(currentFiles).length > 0) {
      latestFilesRef.current = currentFiles;
    }

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
        if (import.meta.env.DEV) {
          console.log("[Editor] Skipping transient hydration snapshot", {
            drawingId: id,
            elementCount: allElements.length,
            transientHydrationEmpty,
            transientHydrationNonRenderable,
          });
        }
        return;
      }

      hasHydratedInitialScene.current = true;
      isBootstrappingScene.current = false;

      if (matchesInitialSnapshot) {
        if (import.meta.env.DEV) {
          console.log("[Editor] Skipping hydration change", {
            drawingId: id,
            elementCount: allElements.length,
          });
        }
        return;
      }

      if (import.meta.env.DEV) {
        console.log("[Editor] First live change after hydration", {
          drawingId: id,
          elementCount: allElements.length,
        });
      }
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
      if (import.meta.env.DEV) {
        console.log("[Editor] Cleared suspicious blank load guard after renderable edit", {
          drawingId: id,
          elementCount: allElements.length,
        });
      }
    }
    if (isBootstrappingScene.current && !hasRenderable) {
      if (import.meta.env.DEV) {
        console.log("[Editor] Bootstrapping guard active", {
          drawingId: id,
          elementCount: allElements.length,
        });
      }
      return;
    }
    latestElementsRef.current = allElements;

    broadcastChanges(allElements, currentFiles);

  }, [debouncedSave, debouncedSavePreview, broadcastChanges, id, resolveSafeSnapshot, canEdit]);

  const handleCanvasDropCapture = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!canEdit || !excalidrawAPI.current) return;

      const allDroppedFiles = Array.from(event.dataTransfer?.files || []);
      const droppedImages = getDroppedImageFiles(event.dataTransfer);
      if (droppedImages.length <= 1 || droppedImages.length !== allDroppedFiles.length) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const appState = excalidrawAPI.current.getAppState?.();
      if (!appState) return;

      try {
        const dropPoint = viewportCoordsToSceneCoords(
          { clientX: event.clientX, clientY: event.clientY },
          appState
        );

        const loadedImages = await Promise.all(droppedImages.map(loadDroppedImageData));
        if (loadedImages.length === 0) return;

        const fileRecords = loadedImages.map(({ fileId, mimeType, dataURL, created }) => ({
          id: fileId,
          mimeType,
          dataURL,
          created,
        }));

        let nextY = dropPoint.y;
        const imageElements = convertToExcalidrawElements(
          loadedImages.map((image, index) => {
            const y = index === 0 ? dropPoint.y - image.height / 2 : nextY;
            nextY = y + image.height + MULTI_IMAGE_DROP_GAP;

            return {
              type: "image" as const,
              x: dropPoint.x - image.width / 2,
              y,
              width: image.width,
              height: image.height,
              fileId: image.fileId as any,
              scale: [1, 1] as [number, number],
              status: "saved" as const,
            };
          })
        );

        excalidrawAPI.current.addFiles(fileRecords);
        excalidrawAPI.current.updateScene({
          elements: [
            ...excalidrawAPI.current.getSceneElementsIncludingDeleted(),
            ...imageElements,
          ],
          appState: {
            selectedElementIds: Object.fromEntries(
              imageElements.map((element: any) => [element.id, true])
            ),
          },
          commitToHistory: true,
        });
      } catch (err) {
        console.error("[Editor] Failed to import dropped images", err);
        toast.error("Failed to import dropped images");
      }
    },
    [canEdit]
  );

  useEffect(() => {
    if (!id || !isReady) return;

    const interval = window.setInterval(() => {
      if (isUnmounting.current) return;
      if (isSyncing.current) return;
      if (!socketRef.current) return;
      if (!excalidrawAPI.current) return;

      const nextFiles = excalidrawAPI.current.getFiles?.() || {};
      const didEmit = emitFilesDeltaIfNeeded(nextFiles);

      if (didEmit && latestAppStateRef.current && debouncedSaveRef.current) {
        hasSceneChangesSinceLoadRef.current = true;
        lastLocalChangeAtRef.current = Date.now();
        debouncedSaveRef.current(id, latestElementsRef.current, latestAppStateRef.current, nextFiles);
        debouncedSavePreview(id);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [id, isReady, emitFilesDeltaIfNeeded]);

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
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

  const handleLibraryChange = useCallback((items: readonly any[]) => {
    if (!canEdit) return;
    if (!user) return;
    if (import.meta.env.DEV) {
      console.log("[Editor] Library changed", { itemCount: items.length });
    }
    debouncedSaveLibrary([...items]);
  }, [debouncedSaveLibrary, canEdit, user]);


  const handleBackClick = async () => {
    if (isSavingOnLeave) return;

    setIsSavingOnLeave(true);
    let shouldNavigate = false;

    try {
      if (!(excalidrawAPI.current && saveDataRef.current && savePreviewRef.current)) {
        shouldNavigate = true;
      } else if (!canEdit) {
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
              onDoubleClick={() => { if (!canEdit) return; setNewName(drawingName); setIsRenaming(true); }}
            >
              {drawingName}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!canEdit ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
              Read-only
            </span>
          ) : null}
          {accessLevel === "owner" && id ? (
            <button
              onClick={() => setIsShareOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
              title="Share"
            >
              <Share2 size={20} />
            </button>
          ) : null}
          <button
            onClick={() => {
              const next = !autoHideEnabled;
              setAutoHideEnabled(next);
              setIsHeaderVisible(true);
              if (autoHideStorageKey) {
                try {
                  window.localStorage.setItem(autoHideStorageKey, next ? "1" : "0");
                } catch {
                }
              }
            }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
            title={autoHideEnabled ? "Disable auto-hide" : "Enable auto-hide"}
          >
            {autoHideEnabled ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />

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
        onDropCapture={handleCanvasDropCapture}
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
            viewModeEnabled={!canEdit}
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

      {id ? (
        <ShareModal
          drawingId={id}
          drawingName={drawingName}
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
        />
      ) : null}
    </div>
  );
};
