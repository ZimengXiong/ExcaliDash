import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RefreshCw,
  Scissors,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getFilesDiff,
  trimDrawing,
  deleteOrphanFiles,
  type FilesDiffResult,
  type FileDiffEntry,
} from '../api';

interface StorageManageModalProps {
  isOpen: boolean;
  drawingId: string;
  drawingName: string;
  onClose: () => void;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '\u2014';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function StatusIcon({ active, present }: { active?: boolean; present: boolean }) {
  if (active) {
    return <span className="text-emerald-600 dark:text-emerald-400 font-bold" title="Active">{'\u2713'}</span>;
  }
  if (present) {
    return <span className="text-amber-500 dark:text-amber-400 font-bold" title="History-only">{'\u25D0'}</span>;
  }
  return <span className="text-neutral-400 dark:text-neutral-500 font-bold" title="Missing">{'\u2717'}</span>;
}

export const StorageManageModal: React.FC<StorageManageModalProps> = ({
  isOpen,
  drawingId,
  drawingName,
  onClose,
}) => {
  const [diffData, setDiffData] = useState<FilesDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<'trim' | 'delete-orphans' | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFilesDiff(drawingId);
      setDiffData(data);
      // Pre-select files where inCanvasActive === false
      const preSelected = new Set<string>();
      for (const f of data.files) {
        if (!f.inCanvasActive) {
          preSelected.add(f.fileId);
        }
      }
      setSelectedIds(preSelected);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load file diff';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [drawingId]);

  useEffect(() => {
    if (isOpen) {
      loadDiff();
      setLastResult(null);
      setConfirmAction(null);
      setConfirmInput('');
    }
  }, [isOpen, loadDiff]);

  const handleToggle = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleTrim = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await trimDrawing(drawingId, confirmInput);
      const t = result.trimmed;
      setLastResult(
        `Trim complete: ${t.elementsRemoved} elements removed, ${t.filesRemoved} files removed, ${t.s3ObjectsDeleted} S3 objects deleted.`
      );
      setConfirmAction(null);
      setConfirmInput('');
      await loadDiff();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Trim failed';
      setError(message);
      setConfirmAction(null);
      setConfirmInput('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrphans = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const result = await deleteOrphanFiles(drawingId, confirmInput, ids);
      setLastResult(
        `Deleted ${result.deleted} orphan file(s).${result.errors > 0 ? ` ${result.errors} error(s).` : ''}`
      );
      setConfirmAction(null);
      setConfirmInput('');
      await loadDiff();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
      setConfirmAction(null);
      setConfirmInput('');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const confirmMatch = confirmInput === drawingName;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 pb-4 border-b-2 border-black dark:border-neutral-700">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 border-2 border-indigo-200 dark:border-indigo-900/30">
            <HardDrive size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              Storage Management
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
              {drawingName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Banners */}
          {lastResult && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-sm font-medium">
              <CheckCircle size={18} className="mt-0.5 shrink-0" />
              {lastResult}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 text-sm font-medium">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Trim History */}
          <div>
            <button
              onClick={() => {
                setConfirmAction('trim');
                setConfirmInput('');
              }}
              className="px-4 py-2.5 font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 bg-rose-600 text-white flex items-center gap-2"
            >
              <Scissors size={16} />
              Trim History
            </button>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Remove deleted elements and orphaned file references from this drawing.
            </p>
          </div>

          <hr className="border-neutral-200 dark:border-neutral-700" />

          {/* File Comparison */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                File Comparison
              </h3>
              <button
                onClick={loadDiff}
                disabled={loading}
                className="px-3 py-1.5 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[1px_1px_0px_0px_rgba(255,255,255,0.08)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            {loading && !diffData ? (
              <div className="flex items-center justify-center py-12 text-neutral-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : diffData ? (
              <>
                {/* Summary */}
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
                  Canvas refs: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{diffData.summary.totalCanvasRefs}</span>
                  {' \u00B7 '}SQLite: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{diffData.summary.totalSqliteFiles}</span>
                  {' \u00B7 '}S3: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{diffData.summary.totalS3Files}</span>
                </p>

                {/* Table */}
                <div className="border-2 border-black dark:border-neutral-700 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-black dark:border-neutral-700">
                          <th className="w-10 px-3 py-2 text-center">
                            <span className="sr-only">Select</span>
                          </th>
                          <th className="px-3 py-2 text-left font-bold text-neutral-700 dark:text-neutral-300">File ID</th>
                          <th className="px-3 py-2 text-center font-bold text-neutral-700 dark:text-neutral-300">Canvas</th>
                          <th className="px-3 py-2 text-center font-bold text-neutral-700 dark:text-neutral-300">SQLite</th>
                          <th className="px-3 py-2 text-center font-bold text-neutral-700 dark:text-neutral-300">S3</th>
                          <th className="px-3 py-2 text-right font-bold text-neutral-700 dark:text-neutral-300">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffData.files.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-neutral-400">
                              No files found.
                            </td>
                          </tr>
                        ) : (
                          diffData.files.map((file: FileDiffEntry) => (
                            <tr
                              key={file.fileId}
                              className="border-t border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                            >
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(file.fileId)}
                                  disabled={file.inCanvasActive}
                                  onChange={() => handleToggle(file.fileId)}
                                  className="accent-rose-600 w-4 h-4 disabled:opacity-30"
                                />
                              </td>
                              <td className="px-3 py-2 text-neutral-900 dark:text-neutral-100 font-mono text-xs truncate max-w-[200px]" title={file.fileId}>
                                {file.fileId}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <StatusIcon active={file.inCanvasActive} present={file.inCanvas} />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <StatusIcon present={file.inSqlite} />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <StatusIcon present={file.inS3} />
                              </td>
                              <td className="px-3 py-2 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">
                                {formatSize(file.s3SizeBytes)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex gap-4 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span><span className="text-emerald-600 dark:text-emerald-400 font-bold">{'\u2713'}</span> active</span>
                  <span><span className="text-amber-500 dark:text-amber-400 font-bold">{'\u25D0'}</span> history-only</span>
                  <span><span className="text-neutral-400 dark:text-neutral-500 font-bold">{'\u2717'}</span> missing</span>
                </div>

                {/* Delete orphans button */}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setConfirmAction('delete-orphans');
                      setConfirmInput('');
                    }}
                    disabled={selectedIds.size === 0}
                    className="px-4 py-2.5 font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 bg-rose-600 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0"
                  >
                    <Trash2 size={16} />
                    Delete Selected Orphans ({selectedIds.size})
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-black dark:border-neutral-700 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-b-2xl">
          <AlertTriangle size={14} className="shrink-0" />
          These operations are irreversible.
        </div>

        {/* Confirmation overlay */}
        {confirmAction && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm">
            <div className="w-full max-w-sm p-6 space-y-4">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-300 border-2 border-rose-200 dark:border-rose-900/30">
                  <AlertTriangle size={24} strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  {confirmAction === 'trim' ? 'Trim History' : 'Delete Orphan Files'}
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Type the drawing name to confirm:
                  <br />
                  <span className="font-bold text-neutral-700 dark:text-neutral-200">{drawingName}</span>
                </p>
              </div>

              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={drawingName}
                autoFocus
                className="w-full px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setConfirmAction(null);
                    setConfirmInput('');
                  }}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-emerald-50 dark:bg-neutral-800 text-emerald-700 dark:text-emerald-200 font-bold rounded-xl border-2 border-emerald-200 dark:border-neutral-700 hover:bg-emerald-100 dark:hover:bg-neutral-700 hover:border-emerald-300 dark:hover:border-neutral-600 hover:-translate-y-0.5 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction === 'trim' ? handleTrim : handleDeleteOrphans}
                  disabled={!confirmMatch || actionLoading}
                  className="flex-1 px-4 py-2.5 font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 bg-rose-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 size={16} className="animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
