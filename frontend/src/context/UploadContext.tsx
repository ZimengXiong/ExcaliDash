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
      id: crypto.randomUUID(),
      fileName: f.name,
      status: 'pending',
      progress: 0
    }));

    setTasks(prev => [...newTasks, ...prev]);

    // Map file index to task ID for progress callbacks (handles duplicate filenames)
    const indexToTaskId = new Map<number, string>();
    newTasks.forEach((t, index) => indexToTaskId.set(index, t.id));

    const handleProgress = (fileIndex: number, status: UploadStatus, progress: number, error?: string) => {
      const taskId = indexToTaskId.get(fileIndex);
      if (taskId) {
        updateTask(taskId, { status, progress, error });
      }
    };

    try {
      await importDrawings(files, targetCollectionId, undefined, handleProgress);
    } catch (e) {
      console.error("Global upload error", e);
      // Mark all new tasks as error if something crashed completely
      newTasks.forEach(t => {
        updateTask(t.id, { status: 'error', error: 'Upload failed unexpectedly' });
      });
    }
  }, [updateTask]);

  return (
    <UploadContext.Provider value={{ tasks, uploadFiles, clearCompleted, removeTask, isUploading }}>
      {children}
    </UploadContext.Provider>
  );
};
