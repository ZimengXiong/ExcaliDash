import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Eye, Clock } from "lucide-react";
import * as api from "../api";

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

      <div className="relative w-full max-w-sm bg-white dark:bg-neutral-900 border-l-2 border-black dark:border-neutral-700 shadow-[-4px_0px_0px_0px_rgba(0,0,0,0.1)] animate-in slide-in-from-right duration-200 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Version History
            </h2>
            {totalCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                {totalCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X size={18} className="text-neutral-500" />
          </button>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-neutral-400">
              <span className="text-sm">Loading history...</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
              <Clock size={32} />
              <span className="text-sm font-medium">No history yet</span>
              <span className="text-xs text-center">
                Version history is created automatically when you save changes.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={`rounded-xl border-2 transition-all duration-200 ${
                    previewId === snap.id
                      ? "border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20"
                      : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  }`}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        Version {snap.version}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {timeAgo(snap.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 mb-2">
                      {new Date(snap.createdAt).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePreview(snap.id)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                          previewId === snap.id
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-neutral-50 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600"
                        }`}
                      >
                        <Eye size={14} />
                        {previewId === snap.id ? "Hide" : "Preview"}
                      </button>
                      <button
                        onClick={() => handleRestore(snap.id)}
                        disabled={restoring}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                          confirmRestore === snap.id
                            ? "bg-amber-500 text-white border-amber-500 animate-pulse"
                            : "bg-neutral-50 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600"
                        } disabled:opacity-50`}
                      >
                        <RotateCcw size={14} />
                        {confirmRestore === snap.id
                          ? "Confirm?"
                          : restoring
                          ? "Restoring..."
                          : "Restore"}
                      </button>
                    </div>
                  </div>

                  {/* Preview info */}
                  {previewId === snap.id && (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
                      {previewLoading ? (
                        <span className="text-xs text-neutral-400">
                          Loading preview...
                        </span>
                      ) : previewData ? (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
                          <div>
                            <span className="font-semibold">Elements:</span>{" "}
                            {Array.isArray(previewData.elements)
                              ? previewData.elements.filter(
                                  (e) => !(e as Record<string, unknown>).isDeleted
                                ).length
                              : 0}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-red-400">
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
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
          <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center">
            Versions are kept for 2 days
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
