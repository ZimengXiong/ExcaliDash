import React, { useState, useRef, useEffect } from 'react';
import { useUpload } from '../context/UploadContext';
import { Loader2, CheckCircle2, AlertCircle, X, ChevronUp, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export const UploadStatus: React.FC = () => {
  const { tasks, clearCompleted, removeTask, isUploading } = useUpload();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-open when upload starts
  useEffect(() => {
    if (isUploading) {
      setIsOpen(true);
    }
  }, [isUploading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (tasks.length === 0) return null;

  const activeCount = tasks.filter(t => t.status === 'uploading' || t.status === 'processing').length;
  const completedCount = tasks.filter(t => t.status === 'success').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 isolate" ref={popoverRef}>
      {/* Popover List */}
      {isOpen && (
        <div className="w-80 bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200 mb-2">
          <div className="p-3 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between bg-slate-50 dark:bg-neutral-800/50">
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">
              Uploads ({activeCount > 0 ? `${activeCount} active` : 'Done'})
            </h3>
            {(completedCount > 0 || errorCount > 0) && !isUploading && (
              <button 
                onClick={clearCompleted}
                className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
              >
                Clear All
              </button>
            )}
          </div>
          
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {tasks.map((task) => (
              <div key={task.id} className="group flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                <div className="flex-shrink-0">
                  {task.status === 'uploading' && <Loader2 size={18} className="text-indigo-600 animate-spin" />}
                  {task.status === 'processing' && <Loader2 size={18} className="text-indigo-600 animate-spin" />}
                  {task.status === 'success' && <CheckCircle2 size={18} className="text-emerald-500" />}
                  {task.status === 'error' && <AlertCircle size={18} className="text-rose-500" />}
                  {task.status === 'pending' && <div className="w-[18px] h-[18px] rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={task.fileName}>
                      {task.fileName}
                    </p>
                    <button 
                      onClick={() => removeTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-opacity p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                      <div 
                        className={clsx(
                          "h-full transition-all duration-300 ease-out rounded-full",
                          task.status === 'error' ? "bg-rose-500" : task.status === 'success' ? "bg-emerald-500" : "bg-indigo-600"
                        )}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    {task.status === 'error' ? (
                       <span className="text-[10px] text-rose-500 font-medium truncate max-w-[80px]" title={task.error}>Failed</span>
                    ) : (
                       <span className="text-[10px] text-slate-400 font-medium w-8 text-right">{task.progress}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "h-12 w-12 rounded-full border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] flex items-center justify-center transition-all hover:-translate-y-1 active:translate-y-0 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] bg-white dark:bg-neutral-800 text-slate-900 dark:text-white relative",
          isOpen && "bg-slate-100 dark:bg-neutral-700 translate-y-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
        )}
      >
        {isUploading ? (
          <div className="relative">
            <Loader2 size={24} className="animate-spin text-indigo-600" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </span>
          </div>
        ) : (
          <div className="relative">
             {isOpen ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
             {(completedCount > 0 || errorCount > 0) && (
               <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-neutral-800" />
             )}
          </div>
        )}
      </button>
    </div>
  );
};
