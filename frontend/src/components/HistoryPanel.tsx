import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Eye, Clock } from "lucide-react";
import * as api from "../api";
import clsx from "clsx";

type Props = {
  drawingId: string;
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
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm bg-white dark:bg-neutral-900 border-l-2 border-black dark:border-neutral-700 shadow-[-4px_0px_0px_0px_rgba(0,0,0,1)] dark:shadow-[-4px_0px_0px_0px_rgba(255,255,255,0.08)] animate-in slide-in-from-right duration-200 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Version History
            </h2>
            {totalCount > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800">
                {totalCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-neutral-400">
              <span className="text-sm font-bold">Loading history...</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
              <Clock size={32} />
              <span className="text-sm font-bold">No history yet</span>
              <span className="text-xs text-center font-semibold">
                Version history is created automatically when you save changes.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={clsx(
                    "rounded-xl border-2 transition-all duration-200 flex flex-col overflow-hidden",
                    previewId === snap.id
                      ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-900/10 shadow-[2px_2px_0px_0px_rgba(79,70,229,1)]"
                      : "border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  )}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        Version {snap.version}
                      </span>
                      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        {timeAgo(snap.createdAt)}
                      </span>
                    </div>
                    <div className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 mb-3">
                      {new Date(snap.createdAt).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePreview(snap.id)}
                        className={clsx(
                          "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all duration-200 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                          previewId === snap.id
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-[1px_1px_0px_0px_rgba(0,0,0,0.15)]"
                            : "bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 border-black dark:border-neutral-600 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5"
                        )}
                      >
                        <Eye size={12} strokeWidth={2.5} />
                        {previewId === snap.id ? "Hide" : "Preview"}
                      </button>
                      <button
                        onClick={() => handleRestore(snap.id)}
                        disabled={restoring}
                        className={clsx(
                          "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                          confirmRestore === snap.id
                            ? "bg-amber-500 text-white border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] animate-pulse"
                            : "bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 border-black dark:border-neutral-600 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5"
                        )}
                      >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        {confirmRestore === snap.id
                          ? "Confirm?"
                          : restoring
                          ? "Restoring..."
                          : "Restore"}
                      </button>
                    </div>
                  </div>

                  {/* Preview info pane */}
                  {previewId === snap.id && (
                    <div className="border-t-2 border-black dark:border-neutral-700 p-3 bg-indigo-50/20 dark:bg-indigo-900/5">
                      {previewLoading ? (
                        <span className="text-[10px] font-semibold text-neutral-400">
                          Loading preview...
                        </span>
                      ) : previewData ? (
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 space-y-1 font-semibold">
                          {Array.isArray(previewData.elements) ? (
                            <div>
                              <span className="font-bold text-neutral-600 dark:text-neutral-300">Active Elements:</span>{" "}
                              {previewData.elements.filter(
                                (e) => !(e as Record<string, unknown>).isDeleted
                              ).length}
                            </div>
                          ) : (
                            // Non-array scenes (e.g. a tldraw document snapshot) have no
                            // flat element list to count; show a neutral note instead of a
                            // misleading "0 elements".
                            <div>Snapshot captured for this version.</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-red-500">
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
        <div className="p-4 border-t-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50">
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 text-center">
            Versions are kept for 2 days
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
