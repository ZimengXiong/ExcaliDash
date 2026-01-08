import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { importDrawings } from '../utils/importUtils';

export type UploadStatus = 'pending' | 'uploading' | 'processing' | 'success' | 'error';

export interface UploadTask {
  id: string;
  fileName: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

interface UploadContextType {
  tasks: UploadTask[];
  uploadFiles: (files: File[], targetCollectionId: string | null) => Promise<void>;
  clearCompleted: () => void;
  removeTask: (id: string) => void;
  isUploading: boolean;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};

export const UploadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const isUploading = tasks.some(t => t.status === 'uploading' || t.status === 'processing');

  const updateTask = useCallback((id: string, updates: Partial<UploadTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status !== 'success' && t.status !== 'error'));
  }, []);

  const uploadFiles = useCallback(async (files: File[], targetCollectionId: string | null) => {
    const newTasks: UploadTask[] = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      fileName: f.name,
      status: 'pending',
      progress: 0
    }));

    setTasks(prev => [...newTasks, ...prev]);

    // Process files
    // Note: We are using a modified importDrawings that will be updated to accept onProgress
    // We map the tasks to the files for the callback
    const fileTaskMap = new Map<string, string>(); // fileName -> taskId
    newTasks.forEach(t => fileTaskMap.set(t.fileName, t.id));

    // We start all uploads. The Utils will handle the actual async work.
    // For now we assume sequential or parallel is handled by util, but we need to pass a callback per file or a global one.

    const handleProgress = (fileName: string, status: UploadStatus, progress: number, error?: string) => {
        const taskId = fileTaskMap.get(fileName);
        if (taskId) {
            updateTask(taskId, { status, progress, error });
        }
    };

    try {
        await importDrawings(files, targetCollectionId, undefined, handleProgress);
    } catch (e) {
        console.error("Global upload error", e);
        // Mark pending as error if something crashed completely
        newTasks.forEach(t => {
            if (t.status === 'pending' || t.status === 'uploading') {
                updateTask(t.id, { status: 'error', error: 'Upload failed unexpectedly' });
            }
        });
    }

  }, [updateTask]);

  return (
    <UploadContext.Provider value={{ tasks, uploadFiles, clearCompleted, removeTask, isUploading }}>
      {children}
    </UploadContext.Provider>
  );
};
