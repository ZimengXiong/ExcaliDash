import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { io, type Socket } from "socket.io-client";
import throttle from "lodash/throttle";
import {
  CaptureUpdateAction,
  getVisibleSceneBounds,
  zoomToFitBounds,
} from "@excalidraw/excalidraw";
import type { OnUserFollowedPayload } from "@excalidraw/excalidraw/types";
import { toast } from "sonner";
import type { UserIdentity } from "../../utils/identity";
import {
  filesNeedRehydration,
  rehydrateFilesFromUrls,
} from "../../utils/rehydrateFiles";
import { buildRemoteSceneUpdate } from "./shared";
import * as api from "../../api";
import { reconcileElements } from "../../utils/sync";

type SceneBounds = [number, number, number, number];

export interface Peer extends UserIdentity {
  socketId: string;
  isActive: boolean;
}

type UseEditorCollaborationInput = {
  drawingId?: string;
  me: UserIdentity;
  isReady: boolean;
  excalidrawAPI: MutableRefObject<any>;
  lastSyncedFilesRef: MutableRefObject<Record<string, any>>;
  lastSyncedElementOrderSigRef: MutableRefObject<string>;
  latestElementsRef: MutableRefObject<readonly any[]>;
  latestFilesRef: MutableRefObject<any>;
  computeElementOrderSig: (elements: readonly any[]) => string;
  recordElementVersion: (element: any) => void;
  onAccessDenied: () => void;
};

const getSocketUrl = () =>
  import.meta.env.VITE_API_URL === "/api"
    ? window.location.origin
    : import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_DEV_BACKEND_URL ||
      "http://localhost:8000";

type RoomJoinSocket = Pick<Socket, "connected" | "emit" | "on" | "off">;

export const bindRoomJoin = (
  socket: RoomJoinSocket,
  drawingId: string,
  user: UserIdentity,
  onJoined: (payload: any) => void,
): (() => void) => {
  const joinRoom = () => {
    socket.emit("join-room", { drawingId, user }, onJoined);
  };

  socket.on("connect", joinRoom);
  if (socket.connected) joinRoom();

  return () => socket.off("connect", joinRoom);
};

export const useEditorCollaboration = ({
  drawingId,
  me,
  isReady,
  excalidrawAPI,
  lastSyncedFilesRef,
  lastSyncedElementOrderSigRef,
  latestElementsRef,
  latestFilesRef,
  computeElementOrderSig,
  recordElementVersion,
  onAccessDenied,
}: UseEditorCollaborationInput) => {
  const [socketMe, setSocketMe] = useState<UserIdentity>(me);
  const socketMeRef = useRef<UserIdentity>(socketMe);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [followedUserId, setFollowedUserId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastPresenceUsersRef = useRef<Peer[] | null>(null);
  const lastCursorEmit = useRef<number>(0);
  const cursorBuffer = useRef<Map<string, any>>(new Map());
  const animationFrameId = useRef<number>(0);
  const isSyncing = useRef(false);
  const pendingRemoteElementsRef = useRef<Map<string, any>>(new Map());
  const pendingRemoteFilesRef = useRef<Record<string, any>>({});
  const pendingRemoteElementOrderRef = useRef<string[] | null>(null);
  const remoteFlushScheduledRef = useRef(false);
  const remoteFlushRafIdRef = useRef<number | null>(null);
  useEffect(() => {
    setSocketMe(me);
  }, [me]);

  useEffect(() => {
    socketMeRef.current = socketMe;
  }, [socketMe]);

  useEffect(() => {
    if (!drawingId || !isReady) return;
    let cancelled = false;
    let catchupGeneration = 0;
    const fileReceipts = new Map<string, object>();
    const cursorUpdates = cursorBuffer.current;
    const socket = io(getSocketUrl(), {
      path: "/socket.io",
      transports: ["websocket", "polling"],
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
    const renderLoop = () => {
      if (cursorBuffer.current.size > 0 && excalidrawAPI.current) {
        const collaborators = new Map<string, any>(
          excalidrawAPI.current.getAppState().collaborators || [],
        );
        cursorBuffer.current.forEach((data, userId) => {
          collaborators.set(userId, data);
        });
        cursorBuffer.current.clear();
        const { sceneUpdate } = buildRemoteSceneUpdate({ collaborators });
        if (sceneUpdate) {
          isSyncing.current = true;
          try {
            excalidrawAPI.current.updateScene(sceneUpdate);
          } finally {
            isSyncing.current = false;
          }
        }
      }
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    // Every client broadcasts its viewport and whom it follows, and the
    // latest of each is kept per person, so whichever of their tabs moved
    // last wins. Following someone then jumps to them at once, a chain
    // (C follows B follows A) tracks A directly, and the server needs no
    // follower state.
    const peerViews = new Map<
      string,
      { bounds: SceneBounds; following: string | null }
    >();
    // Collaborators are keyed by user id, so Excalidraw's follow target
    // (which it calls socketId) is the person, whichever tab they use.
    const followedUser = (): string | null =>
      excalidrawAPI.current?.getAppState().userToFollow?.socketId ?? null;
    // From the person we follow to the leader at the end of its chain; empty
    // when the chain loops, since then nobody in it is broadcasting.
    const followChain = () => {
      const chain: string[] = [];
      let next = followedUser();
      while (next && next !== socketMeRef.current.id && !chain.includes(next)) {
        chain.push(next);
        next = peerViews.get(next)?.following ?? null;
      }
      return next ? [] : chain;
    };
    const applyLeaderBounds = () => {
      const api = excalidrawAPI.current;
      if (!api) return;
      const chain = followChain();
      const bounds = peerViews.get(chain[chain.length - 1])?.bounds;
      if (!bounds) return;
      const { appState: next } = zoomToFitBounds({
        bounds,
        appState: api.getAppState(),
        fitToViewport: true,
        viewportZoomFactor: 1,
      });
      isSyncing.current = true;
      try {
        api.updateScene({
          appState: {
            scrollX: next.scrollX,
            scrollY: next.scrollY,
            zoom: next.zoom,
          },
          // Mirroring a leader is not an edit; keep it out of undo history.
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } finally {
        isSyncing.current = false;
      }
    };
    const emitVisibleBounds = throttle(() => {
      const api = excalidrawAPI.current;
      if (!api) return;
      const appState = api.getAppState();
      socket.emit("visible-bounds", {
        drawingId,
        bounds: getVisibleSceneBounds(appState),
        following: followedUser(),
      });
    }, 50);
    const isSelf = (user: Peer) =>
      user.socketId === socket.id || user.id === socketMeRef.current.id;
    const applyPresence = (users: Peer[]) => {
      const api = excalidrawAPI.current;
      if (!api) return;
      // One header avatar per person, standing for an active tab if any.
      const peersByUser = new Map<string, Peer>();
      users.forEach((user) => {
        if (isSelf(user)) return;
        const known = peersByUser.get(user.id);
        if (!known || (!known.isActive && user.isActive)) {
          peersByUser.set(user.id, user);
        }
      });
      setPeers([...peersByUser.values()]);
      const collaborators = new Map<string, any>(
        api.getAppState().collaborators || [],
      );
      // One entry per person, which Excalidraw's follow mode targets. People
      // are listed before their first cursor move and kept while away,
      // because Excalidraw ends a follow once its target leaves the map.
      collaborators.forEach((_collaborator, userId) => {
        if (!peersByUser.has(userId)) collaborators.delete(userId);
      });
      peersByUser.forEach((user, userId) => {
        collaborators.set(userId, {
          username: user.name,
          color: { background: user.color, stroke: user.color },
          id: userId,
          ...collaborators.get(userId),
          userState: user.isActive ? "active" : "away",
        });
      });
      const { sceneUpdate } = buildRemoteSceneUpdate({ collaborators });
      if (sceneUpdate) {
        isSyncing.current = true;
        try {
          api.updateScene(sceneUpdate);
        } finally {
          isSyncing.current = false;
        }
      }
    };
    socket.on("presence-update", (users: Peer[]) => {
      const knownSocketIds = new Set(
        (lastPresenceUsersRef.current ?? []).map((u) => u.socketId),
      );
      lastPresenceUsersRef.current = users;
      // Someone joined (or we rejoined under a new socket id): they have no
      // viewport for us until we next scroll, so send it now.
      if (users.some((u) => !knownSocketIds.has(u.socketId))) {
        emitVisibleBounds();
      }
      peerViews.forEach((_view, userId) => {
        if (!users.some((u) => u.id === userId)) peerViews.delete(userId);
      });
      applyPresence(users);
    });
    socket.on("error", (payload: any) => {
      const message =
        typeof payload?.message === "string" ? payload.message : null;
      console.warn("[Editor] Socket error:", payload);
      if (message === "You do not have access to this drawing") {
        onAccessDenied();
        return;
      }
      if (message) toast.error(message);
    });
    socket.on("cursor-move", (data: any) => {
      if (data.userId === socketMeRef.current.id) return;
      cursorBuffer.current.set(data.userId, {
        pointer: data.pointer,
        button: data.button || "up",
        selectedElementIds: data.selectedElementIds || {},
        username: data.username,
        color: { background: data.color, stroke: data.color },
        id: data.userId,
        userState: "active",
      });
    });
    socket.on(
      "visible-bounds",
      (payload: {
        drawingId?: string;
        userId?: string;
        bounds?: any;
        following?: unknown;
      }) => {
        if (payload?.drawingId !== drawingId) return;
        if (typeof payload.userId !== "string") return;
        if (!Array.isArray(payload.bounds) || payload.bounds.length !== 4) {
          return;
        }
        peerViews.set(payload.userId, {
          bounds: payload.bounds as SceneBounds,
          following:
            typeof payload.following === "string" ? payload.following : null,
        });
        if (followChain().includes(payload.userId)) applyLeaderBounds();
      },
    );
    // A follower's viewport only mirrors its leader's, so re-broadcasting it
    // would turn each leader pan into one message per follower; followers of
    // a follower resolve the chain to the leader instead.
    const unsubscribeScrollChange = excalidrawAPI.current?.onScrollChange?.(
      () => {
        if (!excalidrawAPI.current?.getAppState().userToFollow) {
          emitVisibleBounds();
        }
      },
    );
    // Excalidraw 0.18 declares an `onUserFollow` prop but never calls it;
    // follow changes are only published through the imperative API.
    const unsubscribeUserFollow = excalidrawAPI.current?.onUserFollow?.(
      ({ userToFollow, action }: OnUserFollowedPayload) => {
        // Excalidraw reports UNFOLLOW(old) before FOLLOW(new) on a switch.
        setFollowedUserId(action === "FOLLOW" ? userToFollow.socketId : null);
        if (action === "FOLLOW") applyLeaderBounds();
        // Tell peers whom we follow now, for anyone following us.
        emitVisibleBounds();
      },
    );
    const hasNonEmptyArray = (value: unknown): value is any[] =>
      Array.isArray(value) && value.length > 0;
    const flushRemoteUpdates = () => {
      remoteFlushScheduledRef.current = false;
      remoteFlushRafIdRef.current = null;
      if (cancelled || !excalidrawAPI.current) return;
      const hasPendingElements = pendingRemoteElementsRef.current.size > 0;
      const hasPendingFiles =
        Object.keys(pendingRemoteFilesRef.current || {}).length > 0;
      const pendingOrderRaw = pendingRemoteElementOrderRef.current;
      const hasPendingOrder = hasNonEmptyArray(pendingOrderRaw);
      if (!hasPendingElements && !hasPendingFiles && !hasPendingOrder) return;
      isSyncing.current = true;
      try {
        const pendingElements = Array.from(
          pendingRemoteElementsRef.current.values(),
        );
        pendingRemoteElementsRef.current.clear();
        const incomingFiles = pendingRemoteFilesRef.current || {};
        pendingRemoteFilesRef.current = {};
        const elementOrder = hasPendingOrder ? pendingOrderRaw : null;
        pendingRemoteElementOrderRef.current = null;
        const { sceneUpdate, mergedElements, nextFiles, shouldUpdateFiles } =
          buildRemoteSceneUpdate({
            localElements:
              excalidrawAPI.current.getSceneElementsIncludingDeleted(),
            pendingElements,
            localAppState: excalidrawAPI.current.getAppState?.(),
            elementOrder,
            lastSyncedFiles: lastSyncedFilesRef.current,
            incomingFiles,
          });
        if (
          shouldUpdateFiles &&
          typeof excalidrawAPI.current.addFiles === "function"
        ) {
          excalidrawAPI.current.addFiles(Object.values(incomingFiles));
        }
        if (mergedElements) {
          if (elementOrder) {
            lastSyncedElementOrderSigRef.current =
              computeElementOrderSig(mergedElements);
          }
          const mergedById = new Map(mergedElements.map((el) => [el.id, el]));
          pendingElements.forEach((el: any) => {
            // Do not acknowledge rejected stale packets or unsent local edits.
            if (mergedById.get(el.id) === el) recordElementVersion(el);
          });
          if (sceneUpdate) excalidrawAPI.current.updateScene(sceneUpdate);
          latestElementsRef.current = mergedElements;
        } else if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }
        if (shouldUpdateFiles) {
          latestFilesRef.current = { ...latestFilesRef.current, ...nextFiles };
          const editorFiles = excalidrawAPI.current.getFiles?.() || {};
          const syncedFiles = { ...nextFiles };
          // Excalidraw retains existing file IDs instead of replacing their
          // bytes. A saved-scene echo may carry a compressed copy of a local
          // original: compare future deltas against the bytes actually held
          // by the editor. Only acknowledge incoming IDs, so unsent local
          // files still surface through the file poll/broadcast path.
          for (const id of Object.keys(incomingFiles)) {
            if (editorFiles[id]) syncedFiles[id] = editorFiles[id];
          }
          lastSyncedFilesRef.current = syncedFiles;
        }
      } finally {
        isSyncing.current = false;
      }
      const moreElements = pendingRemoteElementsRef.current.size > 0;
      const moreFiles =
        Object.keys(pendingRemoteFilesRef.current || {}).length > 0;
      const moreOrder = hasNonEmptyArray(pendingRemoteElementOrderRef.current);
      if (moreElements || moreFiles || moreOrder) {
        if (!remoteFlushScheduledRef.current) {
          remoteFlushScheduledRef.current = true;
          remoteFlushRafIdRef.current =
            requestAnimationFrame(flushRemoteUpdates);
        }
      }
    };
    const scheduleRemoteFlush = () => {
      if (cancelled || remoteFlushScheduledRef.current) return;
      remoteFlushScheduledRef.current = true;
      remoteFlushRafIdRef.current = requestAnimationFrame(flushRemoteUpdates);
    };
    const stageElements = (elements: unknown, fromSnapshot = false) => {
      if (cancelled || !Array.isArray(elements)) return;
      const editor = excalidrawAPI.current;
      const liveById = fromSnapshot
        ? new Map(
            (
              editor?.getSceneElementsIncludingDeleted?.() ??
              latestElementsRef.current
            ).map((el: any) => [el.id, el]),
          )
        : null;
      for (const el of elements) {
        const id = el?.id;
        if (typeof id !== "string" || id.length === 0) continue;
        const live = liveById?.get(id);
        if (
          live &&
          reconcileElements([live], [el], editor?.getAppState?.(), true)[0] !==
            el
        ) {
          continue;
        }
        const previous = pendingRemoteElementsRef.current.get(id);
        // A live packet may still be queued for this frame. Give it the same
        // protection from an older HTTP snapshot as an already-painted edit.
        const [next] = previous
          ? reconcileElements([previous], [el], undefined, fromSnapshot)
          : [el];
        pendingRemoteElementsRef.current.set(id, next);
      }
    };
    const stageFiles = (
      files: Record<string, any> | null | undefined,
      fromSnapshot = false,
    ) => {
      if (cancelled || !files || typeof files !== "object") return;
      const receipt = {};
      Object.keys(files).forEach((id) => fileReceipts.set(id, receipt));
      const stage = (incoming: Record<string, any>) => {
        if (cancelled) return;
        for (const [id, file] of Object.entries(incoming)) {
          // A newer inline packet can arrive while earlier refs are fetching.
          if (fileReceipts.get(id) === receipt) {
            pendingRemoteFilesRef.current[id] = file;
          }
        }
        scheduleRemoteFlush();
      };
      const incomingFiles = { ...files };
      if (fromSnapshot) {
        // File IDs are immutable. Repeated saved-scene/catchup snapshots need
        // no download for bytes already held inline by the editor, including
        // private S3 refs that would otherwise issue new presigned requests.
        const editorFiles = excalidrawAPI.current?.getFiles?.() || {};
        const reusableFiles: Record<string, any> = {};
        for (const id of Object.keys(incomingFiles)) {
          const current = editorFiles[id];
          if (
            typeof current?.dataURL === "string" &&
            current.dataURL.startsWith("data:") &&
            filesNeedRehydration({ [id]: incomingFiles[id] })
          ) {
            reusableFiles[id] = current;
            delete incomingFiles[id];
          }
        }
        if (Object.keys(reusableFiles).length > 0) stage(reusableFiles);
      }
      if (filesNeedRehydration(incomingFiles)) {
        void rehydrateFilesFromUrls(incomingFiles).then(stage);
      } else {
        stage(incomingFiles);
      }
    };
    socket.on(
      "element-update",
      ({
        elements,
        files,
        elementOrder,
        persisted,
      }: {
        elements: any[];
        files?: Record<string, any>;
        elementOrder?: string[];
        persisted?: boolean;
      }) => {
        stageElements(elements, persisted === true);
        stageFiles(files, persisted === true);
        if (
          !persisted &&
          Array.isArray(elementOrder) &&
          elementOrder.length > 0
        ) {
          pendingRemoteElementOrderRef.current = elementOrder;
        }
        scheduleRemoteFlush();
      },
    );
    const catchUpScene = async () => {
      const generation = ++catchupGeneration;
      const receiptsBeforeRead = new Map(fileReceipts);
      try {
        // Joining after the initial load closes its subscription gap; joining
        // after reconnect recovers edits missed while the socket was offline.
        const remote = await api.getDrawing(drawingId);
        if (cancelled || generation !== catchupGeneration) return;
        stageElements(remote.elements, true);
        // Socket packets received during the read already have newer file
        // receipts. A delayed HTTP snapshot must not replace their bytes.
        const remoteFiles = Object.fromEntries(
          Object.entries(remote.files || {}).filter(
            ([id]) => fileReceipts.get(id) === receiptsBeforeRead.get(id),
          ),
        );
        stageFiles(remoteFiles, true);
        scheduleRemoteFlush();
      } catch (error) {
        if (!cancelled && generation === catchupGeneration) {
          console.warn(
            "[Editor] Failed to catch up collaboration scene",
            error,
          );
        }
      }
    };
    const invalidateCatchup = () => {
      catchupGeneration += 1;
    };
    socket.on("disconnect", invalidateCatchup);
    const detachRoomJoin = bindRoomJoin(socket, drawingId, me, (payload) => {
      if (cancelled) return;
      void catchUpScene();
      const serverUser = payload?.user;
      if (!serverUser || typeof serverUser.id !== "string") return;
      const next: UserIdentity = {
        id: serverUser.id,
        name: typeof serverUser.name === "string" ? serverUser.name : me.name,
        initials:
          typeof serverUser.initials === "string"
            ? serverUser.initials
            : me.initials,
        color:
          typeof serverUser.color === "string" ? serverUser.color : me.color,
      };
      socketMeRef.current = next;
      setSocketMe(next);
      if (lastPresenceUsersRef.current) {
        applyPresence(lastPresenceUsersRef.current);
      }
    });
    socket.on("drawing-server-update", (payload: { drawingId?: string }) => {
      if (!payload?.drawingId || payload.drawingId !== drawingId) return;
      toast.info(
        "Drawing storage changed on the server. Reloading the editor.",
      );
      window.location.reload();
    });
    const handleActivity = (isActive: boolean) => {
      socket.emit("user-activity", { drawingId, isActive });
    };
    const onFocus = () => {
      handleActivity(true);
      // Followers move to whichever of our tabs we are looking at.
      if (!excalidrawAPI.current?.getAppState().userToFollow) {
        emitVisibleBounds();
      }
    };
    const onBlur = () => handleActivity(false);
    const onMouseEnter = () => handleActivity(true);
    const onMouseLeave = () => handleActivity(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mouseenter", onMouseEnter);
    document.addEventListener("mouseleave", onMouseLeave);
    const pendingRemoteElements = pendingRemoteElementsRef.current;
    return () => {
      cancelled = true;
      catchupGeneration += 1;
      detachRoomJoin();
      unsubscribeScrollChange?.();
      unsubscribeUserFollow?.();
      emitVisibleBounds.cancel();
      socket.off("disconnect", invalidateCatchup);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("mouseleave", onMouseLeave);
      socket.off("presence-update");
      socket.off("error");
      socket.off("cursor-move");
      socket.off("visible-bounds");
      socket.off("element-update");
      socket.off("drawing-server-update");
      socket.disconnect();
      if (remoteFlushRafIdRef.current !== null) {
        cancelAnimationFrame(remoteFlushRafIdRef.current);
        remoteFlushRafIdRef.current = null;
      }
      remoteFlushScheduledRef.current = false;
      pendingRemoteElements.clear();
      pendingRemoteFilesRef.current = {};
      pendingRemoteElementOrderRef.current = null;
      cursorUpdates.clear();
      lastPresenceUsersRef.current = null;
      setFollowedUserId(null);
      if (socketRef.current === socket) socketRef.current = null;
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [
    drawingId,
    me,
    isReady,
    excalidrawAPI,
    lastSyncedFilesRef,
    lastSyncedElementOrderSigRef,
    latestElementsRef,
    latestFilesRef,
    computeElementOrderSig,
    recordElementVersion,
    onAccessDenied,
  ]);

  const onPointerUpdate = useCallback(
    (payload: any) => {
      const now = Date.now();
      if (now - lastCursorEmit.current > 50 && socketRef.current) {
        const self = socketMeRef.current;
        socketRef.current.emit("cursor-move", {
          pointer: payload.pointer,
          button: payload.button,
          username: self.name,
          userId: self.id,
          drawingId,
          color: self.color,
        });
        lastCursorEmit.current = now;
      }
    },
    [drawingId],
  );

  const toggleFollow = useCallback(
    (peer: Peer) => {
      const api = excalidrawAPI.current;
      if (!api) return;
      const following = api.getAppState().userToFollow?.socketId;
      api.updateScene({
        appState: {
          userToFollow:
            following === peer.id
              ? null
              : { socketId: peer.id, username: peer.name },
        },
        // Following someone is not an edit; keep it out of undo history.
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [excalidrawAPI],
  );

  return {
    peers,
    followedUserId,
    toggleFollow,
    socketMeRef,
    socketRef,
    isSyncing,
    onPointerUpdate,
  };
};
