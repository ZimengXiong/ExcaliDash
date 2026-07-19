import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Eye, Clock } from "lucide-react";
import * as api from "../api";
import clsx from "clsx";

type Props = {
  drawingId: string;
  getCurrentVersion: () => number | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (snapshot: api.DrawingSnapshotFull) => void;
  onPreview: (snapshot: api.DrawingSnapshotFull | null) => void;
};

const smallButtonClass =
  "flex items-center gap-1 rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:border-black disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-400";

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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

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

  const handlePreview = async (snapshotId: string) => {
    if (previewId === snapshotId) {
      // Toggle off — restore current canvas
      setPreviewId(null);
      setPreviewData(null);
      onPreview(null);
      return;
    }
    setPreviewId(snapshotId);
    setPreviewLoading(true);
    try {
      const data = await api.getDrawingSnapshot(drawingId, snapshotId);
      setPreviewData(data);
      onPreview(data);
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
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
      await api.restoreDrawingSnapshot(drawingId, snapshotId, version);
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
    <div className="fixed inset-0 z-[90] flex justify-end pointer-events-none">
      <div className="ui-side-panel pointer-events-auto relative flex h-full w-full flex-col border-l-2 border-black bg-white animate-in slide-in-from-right duration-200 dark:border-neutral-700 dark:bg-neutral-900 md:w-96">
        {/* Header */}
        <div className="flex items-center gap-3 border-b-2 border-slate-100 px-4 py-3.5 dark:border-neutral-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
            <Clock size={17} />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Version history
          </h2>
          {totalCount > 0 && (
            <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[11px] font-black dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
              {totalCount}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close version history"
            className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <span className="text-sm font-bold">Loading history…</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <Clock size={32} />
              <span className="text-sm font-bold">No history yet</span>
              <span className="text-center text-xs font-medium">
                Versions are saved automatically as you edit.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={clsx(
                    "px-4 py-3 transition-colors",
                    previewId === snap.id &&
                      "bg-indigo-50/60 dark:bg-indigo-900/10",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          Version {snap.version}
                        </span>
                        <span className="rounded-full border-2 border-slate-200 px-1.5 py-px text-[10px] font-bold text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
                          {timeAgo(snap.createdAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-neutral-500">
                        {new Date(snap.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handlePreview(snap.id)}
                      className={clsx(
                        smallButtonClass,
                        previewId === snap.id &&
                          "border-black bg-indigo-600 text-white hover:bg-indigo-500 dark:border-neutral-600 dark:hover:bg-indigo-500 dark:hover:border-neutral-600",
                      )}
                    >
                      <Eye size={12} strokeWidth={2.5} />
                      {previewId === snap.id ? "Hide" : "Preview"}
                    </button>
                    <button
                      onClick={() => handleRestore(snap.id)}
                      disabled={restoring}
                      className={clsx(
                        smallButtonClass,
                        confirmRestore === snap.id &&
                          "border-black bg-amber-400 text-amber-950 hover:bg-amber-300 dark:border-neutral-600 dark:hover:bg-amber-300 dark:hover:border-neutral-600",
                      )}
                    >
                      <RotateCcw size={12} strokeWidth={2.5} />
                      {confirmRestore === snap.id
                        ? "Confirm?"
                        : restoring
                          ? "Restoring…"
                          : "Restore"}
                    </button>
                  </div>

                  {previewId === snap.id && (
                    <div className="mt-2 rounded-lg border-2 border-dashed border-indigo-200 px-2.5 py-1.5 dark:border-indigo-800">
                      {previewLoading ? (
                        <span className="text-[11px] font-medium text-slate-400">
                          Loading preview…
                        </span>
                      ) : previewData ? (
                        <div className="text-[11px] font-medium text-slate-500 dark:text-neutral-400">
                          {Array.isArray(previewData.elements) ? (
                            <>
                              <span className="font-bold text-slate-600 dark:text-neutral-300">
                                Active elements:
                              </span>{" "}
                              {
                                previewData.elements.filter(
                                  (e) =>
                                    !(e as Record<string, unknown>).isDeleted,
                                ).length
                              }
                            </>
                          ) : (
                            // Non-array scenes (e.g. a tldraw document snapshot) have no
                            // flat element list to count; show a neutral note instead of a
                            // misleading "0 elements".
                            "Snapshot captured for this version."
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-500">
                          Failed to load preview
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-slate-100 px-4 py-3 dark:border-neutral-800">
          <p className="text-center text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500">
            Versions are kept for 2 days
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
