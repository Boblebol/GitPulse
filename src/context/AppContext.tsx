import { createContext, useContext, useState, type ReactNode } from "react";
import type { AnalysisScope, AnalysisScopeMode, ScanProgress, TimeRange } from "../types";
import {
  hasDismissedProductTour,
  markProductTourDismissed,
  resetProductTourDismissed,
} from "../utils/productTour";
import {
  clearDemoModeEnabled,
  isDemoModeEnabled,
  markDemoModeEnabled,
} from "../utils/demoMode";
import { createTimeRange } from "../utils/timeRange";

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
  analysisScopeMode: AnalysisScopeMode;
  setAnalysisScopeMode: (mode: AnalysisScopeMode) => void;
  analysisScope: AnalysisScope;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
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
  isProductTourOpen: boolean;
  openProductTour: () => void;
  dismissProductTour: () => void;
  resetProductTour: () => void;
  isDemoMode: boolean;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [analysisScopeMode, setAnalysisScopeModeState] =
    useState<AnalysisScopeMode>("repo");
  const [timeRange, setTimeRange] = useState<TimeRange>(() => createTimeRange("all"));
  const [scanningRepoId, setScanningRepoId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [scanProgressByRepo, setScanProgressByRepo] = useState<Record<string, ScanProgress>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isProductTourOpen, setIsProductTourOpen] = useState<boolean>(
    () => !hasDismissedProductTour(),
  );
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => isDemoModeEnabled());

  const updateWorkspaceId = (id: string | null) => {
    setWorkspaceId(id);
    setAnalysisScopeModeState("repo");
  };

  const updateRepoId = (id: string | null) => {
    setRepoId(id);
    setAnalysisScopeModeState("repo");
  };

  const analysisScope: AnalysisScope = {
    mode: analysisScopeMode,
    repoId: analysisScopeMode === "repo" ? repoId : null,
    workspaceId: analysisScopeMode === "workspace" ? workspaceId : null,
  };

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

  const openProductTour = () => {
    setIsProductTourOpen(true);
  };

  const dismissProductTour = () => {
    markProductTourDismissed();
    setIsProductTourOpen(false);
  };

  const resetProductTour = () => {
    resetProductTourDismissed();
    setIsProductTourOpen(true);
  };

  const enableDemoMode = () => {
    markDemoModeEnabled();
    setIsDemoMode(true);
  };

  const disableDemoMode = () => {
    clearDemoModeEnabled();
    setIsDemoMode(false);
  };

  return (
    <AppContext.Provider
      value={{
        workspaceId,
        repoId,
        setWorkspaceId: updateWorkspaceId,
        setRepoId: updateRepoId,
        analysisScopeMode,
        setAnalysisScopeMode: setAnalysisScopeModeState,
        analysisScope,
        timeRange,
        setTimeRange,
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
        isProductTourOpen,
        openProductTour,
        dismissProductTour,
        resetProductTour,
        isDemoMode,
        enableDemoMode,
        disableDemoMode,
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
