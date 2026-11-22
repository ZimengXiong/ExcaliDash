import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { uuidv4 } from "../utils/uuid";

export type UploadStatus =
  "pending" | "uploading" | "processing" | "success" | "error";

interface UploadTask {
  id: string;
  fileName: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

interface UploadContextType {
  tasks: UploadTask[];
  uploadFiles: (
    files: File[],
    targetCollectionId: string | null,
  ) => Promise<void>;
  clearCompleted: () => void;
  clearSuccessful: () => void;
  removeTask: (id: string) => void;
  isUploading: boolean;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);
const UploadFilesContext = createContext<
  UploadContextType["uploadFiles"] | undefined
>(undefined);

export const useUploadFiles = () => {
  const uploadFiles = useContext(UploadFilesContext);
  if (!uploadFiles)
    throw new Error("useUploadFiles must be used within an UploadProvider");
  return uploadFiles;
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
};

export const UploadProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const isUploading = tasks.some(
    (t) =>
      t.status === "pending" ||
      t.status === "uploading" ||
      t.status === "processing",
  );

  const updateTask = useCallback((id: string, updates: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks((prev) =>
      prev.filter((t) => t.status !== "success" && t.status !== "error"),
    );
  }, []);

  const clearSuccessful = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== "success"));
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], targetCollectionId: string | null) => {
      const supportedFiles = files.filter(
        (f) => f.name.endsWith(".json") || f.name.endsWith(".excalidraw"),
      );
      const unsupportedFiles = files.filter((f) => !supportedFiles.includes(f));

      const unsupportedTasks: UploadTask[] = unsupportedFiles.map((f) => ({
        id: uuidv4(),
        fileName: f.name,
        status: "error",
        progress: 0,
        error: "Unsupported file type",
      }));

      const supportedTasks: UploadTask[] = supportedFiles.map((f) => ({
        id: uuidv4(),
        fileName: f.name,
        status: "pending",
        progress: 0,
      }));

      const newTasks: UploadTask[] = [...unsupportedTasks, ...supportedTasks];

      setTasks((prev) => [...newTasks, ...prev]);

      const indexToTaskId = new Map<number, string>();
      supportedTasks.forEach((task, index) =>
        indexToTaskId.set(index, task.id),
      );

      const handleProgress = (
        fileIndex: number,
        status: UploadStatus,
        progress: number,
        error?: string,
      ) => {
        const taskId = indexToTaskId.get(fileIndex);
        if (taskId) {
          updateTask(taskId, { status, progress, error });
        }
      };

      try {
        if (supportedFiles.length === 0) return;
        const { importDrawings } = await import("../utils/importUtils");
        await importDrawings(
          supportedFiles,
          targetCollectionId,
          undefined,
          handleProgress,
        );
      } catch (e) {
        console.error("Global upload error", e);
        newTasks.forEach((t) => {
          if (t.status !== "error") {
            updateTask(t.id, {
              status: "error",
              error: "Upload failed unexpectedly",
            });
          }
        });
      }
    },
    [updateTask],
  );

  const value = useMemo(
    () => ({
      tasks,
      uploadFiles,
      clearCompleted,
      clearSuccessful,
      removeTask,
      isUploading,
    }),
    [
      tasks,
      uploadFiles,
      clearCompleted,
      clearSuccessful,
      removeTask,
      isUploading,
    ],
  );
  return (
    <UploadFilesContext.Provider value={uploadFiles}>
      <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
    </UploadFilesContext.Provider>
  );
};
