import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Clock, ChevronDown } from "lucide-react";
import * as api from "../api";
import clsx from "clsx";
import { useLocale } from "../context/useLocale";
import { formatDateTime, formatTimeAgoShort } from "../i18n/format";

type Props = {
  drawingId: string;
  anchorRef?: React.RefObject<HTMLElement>;
  getCurrentVersion: () => number | null;
  isOpen: boolean;
  onClose: () => void;
  onRestoreSnapshot: (snapshotId: string) => Promise<void>;
  onRestore: () => void;
  onPreview: (snapshot: api.DrawingSnapshotFull | null) => void;
};

export const HistoryPanel: React.FC<Props> = ({
  drawingId,
  anchorRef,
  getCurrentVersion,
  isOpen,
  onClose,
  onRestore,
  onRestoreSnapshot,
  onPreview,
}) => {
  const { locale, t } = useLocale();
  const [snapshots, setSnapshots] = useState<api.DrawingSnapshotSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] =
    useState<api.DrawingSnapshotFull | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const previewRequestSequence = useRef(0);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const [position, setPosition] = useState<{
    left?: number;
    right?: number;
    top: number;
  }>({
    right: 12,
    top: 76,
  });

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDrawingHistory(drawingId, { limit: 100 });
      setSnapshots(data.snapshots);
      setTotalCount(data.totalCount);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [drawingId]);

  useEffect(() => {
    previewRequestSequence.current += 1;
    if (isOpen) {
      loadHistory();
      setPreviewId(null);
      setPreviewData(null);
      setConfirmRestore(null);
    } else {
      // Panel closed — restore current canvas
      if (previewId) {
        setPreviewId(null);
        setPreviewData(null);
        onPreview(null);
      }
    }
    return () => {
      previewRequestSequence.current += 1;
    };
  }, [isOpen, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const anchor = anchorRef?.current;
      if (!anchor) {
        setPosition({ right: 12, top: 76 });
        return;
      }
      const rect = anchor.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 372)),
        top: rect.bottom + 8,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchorRef, isOpen]);

  const handlePreview = async (snapshotId: string) => {
    if (restoring) return;
    if (previewId === snapshotId) {
      // Toggle off — restore current canvas
      previewRequestSequence.current += 1;
      setPreviewId(null);
      setPreviewData(null);
      onPreview(null);
      return;
    }
    const requestSequence = ++previewRequestSequence.current;
    setPreviewId(snapshotId);
    try {
      const data = await api.getDrawingSnapshot(drawingId, snapshotId);
      if (
        !isOpenRef.current ||
        previewRequestSequence.current !== requestSequence
      ) {
        return;
      }
      setPreviewData(data);
      onPreview(data);
    } catch {
      if (
        !isOpenRef.current ||
        previewRequestSequence.current !== requestSequence
      ) {
        return;
      }
      setPreviewId(null);
      setPreviewData(null);
      onPreview(null);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (restoring) return;
    if (confirmRestore !== snapshotId) {
      setConfirmRestore(snapshotId);
      return;
    }
    setRestoring(true);
    try {
      const version = getCurrentVersion();
      if (version === null) {
        throw new Error("Drawing is still loading. Please try again.");
      }
      await onRestoreSnapshot(snapshotId);
      onRestore();
      onClose();
    } catch {
      // ignore
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        data-testid="history-dismiss-layer"
        className={clsx(
          "fixed inset-0 z-[150] bg-transparent",
          previewData && "pointer-events-none",
        )}
        onClick={() => {
          if (!restoring) onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="ui-card fixed z-[160] flex max-h-[min(32rem,calc(100vh-5.75rem))] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200"
        style={position}
        role="dialog"
        aria-modal="false"
        aria-label={t("editor.history.title")}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b-2 border-slate-100 px-4 py-3.5 dark:border-neutral-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-slate-800 bg-indigo-400 text-slate-900 dark:border-neutral-700 dark:bg-indigo-400 dark:text-black">
            <Clock size={17} />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t("editor.history.title")}
          </h2>
          {totalCount > 0 && (
            <span className="rounded-full border-2 border-slate-800 bg-white px-2 py-0.5 text-[11px] font-semibold dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
              {totalCount}
            </span>
          )}
          <button
            onClick={() => {
              if (!restoring) onClose();
            }}
            disabled={restoring}
            aria-label={t("editor.history.close")}
            className="ui-icon-button ml-auto h-8 w-8 border-transparent bg-transparent shadow-none hover:border-slate-200 dark:bg-transparent dark:hover:border-neutral-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Snapshot list */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <span className="text-sm font-semibold">
                {t("editor.history.loading")}
              </span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Clock size={32} />
              <span className="text-sm font-semibold">
                {t("editor.history.empty")}
              </span>
              <span className="text-center text-xs font-medium">
                {t("editor.history.emptyHint")}
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  onClick={() => handlePreview(snap.id)}
                  className={clsx(
                    "flex cursor-pointer select-none items-center justify-between gap-3 border-l-4 border-transparent px-4 py-3.5 transition-colors hover:bg-indigo-50/60 dark:hover:bg-neutral-800/40",
                    previewId === snap.id &&
                      "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("editor.history.version", { version: snap.version })}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {formatTimeAgoShort(snap.createdAt, locale) ??
                          t("editor.history.justNow")}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-400 dark:text-neutral-500">
                      {formatDateTime(snap.createdAt, locale)}
                    </div>
                  </div>

                  <div
                    className="shrink-0 flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {previewId === snap.id ? (
                      <button
                        onClick={() => handleRestore(snap.id)}
                        disabled={restoring}
                        className={clsx(
                          "ui-button-primary px-2.5 py-1 text-xs",
                          confirmRestore === snap.id
                            ? "bg-amber-400 text-black hover:bg-amber-300 dark:bg-amber-400 dark:text-black"
                            : "",
                        )}
                      >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        {confirmRestore === snap.id
                          ? t("editor.history.confirmRestore")
                          : restoring
                            ? t("editor.history.restoring")
                            : t("editor.history.restore")}
                      </button>
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-slate-350 dark:text-neutral-700"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-slate-100 px-4 py-3 dark:border-neutral-800">
          <p className="text-center text-xs font-semibold text-slate-400 dark:text-neutral-500">
            {t("editor.history.retention")}
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
};
