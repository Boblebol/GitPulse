import { createContext, useContext, useState, type ReactNode } from "react";
import type { ScanProgress } from "../types";

interface Notification {
  id: string;
  message: string;
  type: "success" | "error";
}

interface AppContextValue {
  workspaceId: string | null;
  repoId: string | null;
  setWorkspaceId: (id: string | null) => void;
  setRepoId: (id: string | null) => void;
  scanningRepoId: string | null;
  setScanningRepoId: (id: string | null) => void;
  syncStatus: string;
  setSyncStatus: (status: string) => void;
  scanProgressByRepo: Record<string, ScanProgress>;
  setScanProgress: (progress: ScanProgress) => void;
  clearScanProgress: (repoId: string) => void;
  notifications: Notification[];
  addNotification: (message: string, type: "success" | "error") => void;
  removeNotification: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [scanningRepoId, setScanningRepoId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [scanProgressByRepo, setScanProgressByRepo] = useState<Record<string, ScanProgress>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const setScanProgress = (progress: ScanProgress) => {
    setScanProgressByRepo((prev) => ({
      ...prev,
      [progress.repo_id]: progress,
    }));
  };

  const clearScanProgress = (repoId: string) => {
    setScanProgressByRepo((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
  };

  const addNotification = (message: string, type: "success" | "error") => {
    const id = Math.random().toString(36).substr(2, 9);
    const notif: Notification = { id, message, type };
    setNotifications((prev) => [...prev, notif]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 3000);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        workspaceId,
        repoId,
        setWorkspaceId,
        setRepoId,
        scanningRepoId,
        setScanningRepoId,
        syncStatus,
        setSyncStatus,
        scanProgressByRepo,
        setScanProgress,
        clearScanProgress,
        notifications,
        addNotification,
        removeNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}
