import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Clock, ChevronDown } from "lucide-react";
import * as api from "../api";
import clsx from "clsx";

type Props = {
  drawingId: string;
  anchorRef?: React.RefObject<HTMLElement>;
  getCurrentVersion: () => number | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (snapshot: api.DrawingSnapshotFull) => void;
  onPreview: (snapshot: api.DrawingSnapshotFull | null) => void;
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const HistoryPanel: React.FC<Props> = ({
  drawingId,
  anchorRef,
  getCurrentVersion,
  isOpen,
  onClose,
  onRestore,
  onPreview,
}) => {
  const [snapshots, setSnapshots] = useState<api.DrawingSnapshotSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<api.DrawingSnapshotFull | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left?: number; right?: number; top: number }>({
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
    if (isOpen) {
      loadHistory();
      setPreviewId(null);
      setPreviewData(null);
      setConfirmRestore(null);
    } else {
      // Panel closed — restore current canvas
      if (previewId) onPreview(null);
    }
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
    if (previewId === snapshotId) {
      // Toggle off — restore current canvas
      setPreviewId(null);
      setPreviewData(null);
      onPreview(null);
      return;
    }
    setPreviewId(snapshotId);
    try {
      const data = await api.getDrawingSnapshot(drawingId, snapshotId);
      setPreviewData(data);
      onPreview(data);
    } catch {
      setPreviewData(null);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (confirmRestore !== snapshotId) {
      setConfirmRestore(snapshotId);
      return;
    }
    setRestoring(true);
    try {
      // Fetch full snapshot if not already loaded
      let data = previewData;
      if (!data || data.id !== snapshotId) {
        data = await api.getDrawingSnapshot(drawingId, snapshotId);
      }
      const version = getCurrentVersion();
      if (version === null) {
        throw new Error("Drawing is still loading. Please try again.");
      }
      await api.restoreDrawingSnapshot(drawingId, snapshotId);
      onRestore(data);
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
        className="fixed inset-0 z-[150] bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="ui-card fixed z-[160] flex max-h-[min(32rem,calc(100vh-5.75rem))] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200"
        style={position}
        role="dialog"
        aria-modal="false"
        aria-label="Version history"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b-2 border-slate-100 px-4 py-3.5 dark:border-neutral-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-slate-800 bg-indigo-400 text-slate-900 dark:border-neutral-700 dark:bg-indigo-400 dark:text-black">
            <Clock size={17} />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Version history
          </h2>
          {totalCount > 0 && (
            <span className="rounded-full border-2 border-slate-800 bg-white px-2 py-0.5 text-[11px] font-semibold dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
              {totalCount}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close version history"
            className="ui-icon-button ml-auto h-8 w-8 border-transparent bg-transparent shadow-none hover:border-slate-200 dark:bg-transparent dark:hover:border-neutral-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Snapshot list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <span className="text-sm font-semibold">Loading history…</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Clock size={32} />
              <span className="text-sm font-semibold">No history yet</span>
              <span className="text-center text-xs font-medium">
                Versions are saved automatically as you edit.
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
                        Version {snap.version}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {timeAgo(snap.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-400 dark:text-neutral-500">
                      {new Date(snap.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {previewId === snap.id ? (
                      <button
                        onClick={() => handleRestore(snap.id)}
                        disabled={restoring}
                        className={clsx(
                          "ui-button-primary px-2.5 py-1 text-xs",
                          confirmRestore === snap.id
                            ? "bg-amber-400 text-black hover:bg-amber-300 dark:bg-amber-400 dark:text-black"
                            : ""
                        )}
                      >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        {confirmRestore === snap.id
                          ? "Confirm?"
                          : restoring
                            ? "Restoring…"
                            : "Restore"}
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
            Versions are kept for 2 days
          </p>
        </div>
      </div>
    </>,
    document.body
  );
};
