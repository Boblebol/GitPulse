import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useWorkspaces,
  useRepos,
  useCreateWorkspace,
  useAddRepo,
  useTriggerScan,
  usePauseScan,
  useResumeScan,
  useScanStatus,
  useDeleteWorkspace,
  useRemoveRepo,
  useSetRepoBranch,
  useListRepoBranches,
  useRepoBranches,
  useScanProgressEvents,
} from "../../hooks/useRepos";
import type { ReactNode } from "react";
import { AppProvider, useAppContext } from "../../context/AppContext";

// Mock tauri API
jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

jest.mock("@tauri-apps/api/event", () => ({
  listen: jest.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

describe("useRepos hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  const appWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  );

  describe("useWorkspaces", () => {
    it("fetches workspaces successfully", async () => {
      const mockWorkspaces = [
        { id: "ws1", name: "Workspace 1" },
        { id: "ws2", name: "Workspace 2" },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockWorkspaces);

      const { result } = renderHook(() => useWorkspaces(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockWorkspaces);
      expect(invoke).toHaveBeenCalledWith("list_workspaces");
    });

    it("handles fetch error", async () => {
      const error = new Error("Failed to fetch workspaces");
      (invoke as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useWorkspaces(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });

    it("retries on error by default", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useWorkspaces(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(invoke).toHaveBeenCalled();
    });
  });

  describe("useRepos", () => {
    it("fetches repos for a workspace", async () => {
      const mockRepos = [
        {
          id: "repo1",
          name: "Project A",
          path: "/path/to/repo1",
          active_branch: "main",
        },
      ];

      (invoke as jest.Mock).mockResolvedValue(mockRepos);

      const { result } = renderHook(() => useRepos("ws1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockRepos);
      expect(invoke).toHaveBeenCalledWith("list_repos", { workspaceId: "ws1" });
    });

    it("does not fetch repos when workspaceId is null", () => {
      const { result } = renderHook(() => useRepos(null), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("handles fetch error for repos", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Failed to fetch repos"));

      const { result } = renderHook(() => useRepos("ws1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("refetches when workspaceId changes", async () => {
      const mockRepos1 = [{ id: "repo1", name: "Project A", path: "/path/to/repo1", active_branch: "main" }];
      const mockRepos2 = [{ id: "repo2", name: "Project B", path: "/path/to/repo2", active_branch: "main" }];

      (invoke as jest.Mock)
        .mockResolvedValueOnce(mockRepos1)
        .mockResolvedValueOnce(mockRepos2);

      const { result, rerender } = renderHook(
        ({ wsId }: { wsId: string | null }) => useRepos(wsId),
        { wrapper, initialProps: { wsId: "ws1" } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockRepos1);

      await act(async () => {
        rerender({ wsId: "ws2" });
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("useRepoBranches", () => {
    it("fetches branches for a repository path", async () => {
      (invoke as jest.Mock).mockResolvedValue(["main", "release"]);

      const { result } = renderHook(() => useRepoBranches("/repo/path"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(["main", "release"]);
      expect(invoke).toHaveBeenCalledWith("list_repo_branches", { path: "/repo/path" });
    });

    it("does not fetch branches without a repository path", () => {
      renderHook(() => useRepoBranches(null), { wrapper });

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("useCreateWorkspace", () => {
    it("creates a workspace successfully", async () => {
      const mockWorkspace = { id: "ws1", name: "New Workspace" };
      (invoke as jest.Mock).mockResolvedValue(mockWorkspace);

      // Prime cache with existing workspaces
      await act(async () => {
        queryClient.setQueryData(["workspaces"], []);
      });

      const { result } = renderHook(() => useCreateWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("New Workspace");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("create_workspace", { name: "New Workspace" });
    });

    it("handles creation error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Creation failed"));

      const { result } = renderHook(() => useCreateWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("New Workspace");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates workspaces query on success", async () => {
      const mockWorkspace = { id: "ws1", name: "New Workspace" };
      (invoke as jest.Mock).mockResolvedValue(mockWorkspace);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("New Workspace");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalled();
    });
  });

  describe("useDeleteWorkspace", () => {
    it("deletes a workspace successfully", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("ws1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("delete_workspace", { workspaceId: "ws1" });
    });

    it("handles deletion error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Deletion failed"));

      const { result } = renderHook(() => useDeleteWorkspace(), { wrapper });

      await act(async () => {
        result.current.mutate("ws1");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe("useAddRepo", () => {
    it("adds a repo to a workspace", async () => {
      const mockRepo = {
        id: "repo1",
        name: "New Repo",
        path: "/path/to/repo",
        active_branch: "main",
      };
      (invoke as jest.Mock).mockResolvedValue(mockRepo);

      const { result } = renderHook(() => useAddRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({
          workspaceId: "ws1",
          path: "/path/to/repo",
          name: "New Repo",
          branch: "main",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("add_repo", {
        workspaceId: "ws1",
        path: "/path/to/repo",
        name: "New Repo",
        branch: "main",
      });
    });

    it("handles add error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Add failed"));

      const { result } = renderHook(() => useAddRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({
          workspaceId: "ws1",
          path: "/path/to/repo",
          name: "New Repo",
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates repos query on success", async () => {
      const mockRepo = {
        id: "repo1",
        name: "New Repo",
        path: "/path/to/repo",
        active_branch: "main",
      };
      (invoke as jest.Mock).mockResolvedValue(mockRepo);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useAddRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({
          workspaceId: "ws1",
          path: "/path/to/repo",
          name: "New Repo",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalled();
    });
  });

  describe("useRemoveRepo", () => {
    it("removes a repo from workspace", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRemoveRepo(), { wrapper });

      await act(async () => {
        result.current.mutate({ repoId: "repo1", workspaceId: "ws1" });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("remove_repo", { repoId: "repo1" });
    });
  });

  describe("useSetRepoBranch", () => {
    it("sets repo branch successfully", async () => {
      const mockRepo = {
        id: "repo1",
        name: "Project A",
        path: "/path/to/repo",
        active_branch: "develop",
      };
      (invoke as jest.Mock).mockResolvedValue(mockRepo);

      const { result } = renderHook(() => useSetRepoBranch(), { wrapper });

      await act(async () => {
        result.current.mutate({
          repoId: "repo1",
          branch: "develop",
          workspaceId: "ws1",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("set_repo_branch", {
        repoId: "repo1",
        branch: "develop",
      });
    });

    it("invalidates repo, stats, and branch queries after branch changes", async () => {
      (invoke as jest.Mock).mockResolvedValue({
        id: "repo1",
        name: "Project A",
        path: "/path/to/repo",
        active_branch: "develop",
      });
      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useSetRepoBranch(), { wrapper });

      await act(async () => {
        result.current.mutate({
          repoId: "repo1",
          branch: "develop",
          workspaceId: "ws1",
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["repos", "ws1"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({
        queryKey: ["branches", "/path/to/repo"],
      });
    });
  });

  describe("useListRepoBranches", () => {
    it("is disabled by default", () => {
      const { result } = renderHook(() => useListRepoBranches(), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("useTriggerScan", () => {
    it("triggers a scan on a repo without writing scan logs", async () => {
      const mockScanResult = { commits_added: 100 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("trigger_scan", { repoId: "repo1" });
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\[Scan\]/),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });

    it("handles scan error", async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error("Scan failed"));

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it("invalidates all relevant queries on success", async () => {
      const mockScanResult = { commits_added: 100 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should invalidate stats, daily_stats, file_stats, etc
      expect(invalidateQuerySpy).toHaveBeenCalled();
    });

    it("does not log scan completion", async () => {
      const mockScanResult = { commits_added: 150 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("does not log onSuccess callback", async () => {
      const mockScanResult = { commits_added: 100 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { result } = renderHook(() => useTriggerScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("usePauseScan", () => {
    it("pauses a scan run with the expected payload", async () => {
      (invoke as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => usePauseScan(), { wrapper });

      await act(async () => {
        result.current.mutate("scan1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invoke).toHaveBeenCalledWith("pause_scan", { scanRunId: "scan1" });
    });
  });

  describe("useResumeScan", () => {
    it("resumes a scan for a repo with the expected payload", async () => {
      const mockScanResult = { commits_added: 25, files_processed: 7 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const { result } = renderHook(() => useResumeScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockScanResult);
      expect(invoke).toHaveBeenCalledWith("resume_scan", { repoId: "repo1" });
    });

    it("invalidates scan-dependent queries on success", async () => {
      const mockScanResult = { commits_added: 25, files_processed: 7 };
      (invoke as jest.Mock).mockResolvedValue(mockScanResult);

      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useResumeScan(), { wrapper });

      await act(async () => {
        result.current.mutate("repo1");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["daily_stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["file_stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["directory_stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["leaderboard"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["box_score"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["repos"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["scan_status", "repo1"] });
    });
  });

  describe("useScanStatus", () => {
    it("fetches scan status for a repo with the expected payload", async () => {
      const mockProgress = {
        id: "scan1",
        repo_id: "repo1",
        status: "paused",
        commits_indexed: 12,
        files_processed: 4,
        total_commits: 20,
        progress_percent: 60,
        elapsed_seconds: 30,
        eta_seconds: 20,
        cursor_sha: "commit-a",
        target_head_sha: "commit-z",
        error_message: null,
      };
      (invoke as jest.Mock).mockResolvedValue(mockProgress);

      const { result } = renderHook(() => useScanStatus("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toMatchObject({
        repo_id: "repo1",
        scan_run_id: "scan1",
        status: "paused",
        commits_indexed: 12,
        files_processed: 4,
        total_commits: 20,
        progress_percent: 60,
        elapsed_seconds: 30,
        eta_seconds: 20,
        cursor_sha: "commit-a",
        target_head_sha: "commit-z",
      });
      expect(invoke).toHaveBeenCalledWith("get_scan_status", { repoId: "repo1" });
    });

    it("normalizes camelCase scan estimate fields from status responses", async () => {
      (invoke as jest.Mock).mockResolvedValue({
        id: "scan3",
        repoId: "repo1",
        status: "running",
        commitsIndexed: 25,
        filesProcessed: 10,
        totalCommits: 100,
        progressPercent: 25,
        elapsedSeconds: 50,
        etaSeconds: 150,
        cursorSha: "commit-c",
        targetHeadSha: "commit-z",
      });

      const { result } = renderHook(() => useScanStatus("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toMatchObject({
        repo_id: "repo1",
        scan_run_id: "scan3",
        status: "running",
        commits_indexed: 25,
        files_processed: 10,
        total_commits: 100,
        progress_percent: 25,
        elapsed_seconds: 50,
        eta_seconds: 150,
        cursor_sha: "commit-c",
        target_head_sha: "commit-z",
      });
    });

    it("maps failed scan run errors from the backend status shape", async () => {
      (invoke as jest.Mock).mockResolvedValue({
        id: "scan2",
        repo_id: "repo1",
        status: "failed",
        commits_indexed: 6,
        files_processed: 3,
        cursor_sha: "commit-b",
        target_head_sha: "commit-z",
        error_message: "boom",
      });

      const { result } = renderHook(() => useScanStatus("repo1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toMatchObject({
        scan_run_id: "scan2",
        status: "failed",
        error: "boom",
      });
    });

    it("does not fetch scan status when repoId is null", () => {
      const { result } = renderHook(() => useScanStatus(null), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("useScanProgressEvents", () => {
    type ScanProgressHandler = Parameters<typeof listen>[1];

    function renderScanProgressHook() {
      return renderHook(
        () => {
          useScanProgressEvents();
          return useAppContext();
        },
        { wrapper: appWrapper }
      );
    }

    function mockScanProgressListen() {
      const unlisten = jest.fn();
      let handler: ScanProgressHandler | undefined;

      (listen as jest.Mock).mockImplementation((_event, callback) => {
        handler = callback;
        return Promise.resolve(unlisten);
      });

      return {
        emit: async (payload: Parameters<ScanProgressHandler>[0]["payload"]) => {
          if (!handler) throw new Error("scan_progress listener not registered");
          await act(async () => {
            handler({ event: "scan_progress", id: 1, payload });
          });
        },
        unlisten,
      };
    }

    it("listens to scan_progress and unlistens on unmount", async () => {
      const { unlisten } = mockScanProgressListen();

      const { unmount } = renderScanProgressHook();

      await waitFor(() => {
        expect(listen).toHaveBeenCalledWith("scan_progress", expect.any(Function));
      });

      unmount();

      await waitFor(() => {
        expect(unlisten).toHaveBeenCalled();
      });
    });

    it("stores running progress and marks the repo as scanning", async () => {
      const listener = mockScanProgressListen();
      const { result } = renderScanProgressHook();

      await listener.emit({
        repo_id: "repo1",
        scan_run_id: "scan1",
        status: "running",
        commits_indexed: 12,
        files_processed: 4,
        total_commits: 100,
        progress_percent: 12,
        elapsed_seconds: 60,
        eta_seconds: 440,
        cursor_sha: "commit-a",
        target_head_sha: "commit-z",
        message: "Indexing commits",
      });

      await waitFor(() => {
        expect(result.current.scanProgressByRepo.repo1).toMatchObject({
          repo_id: "repo1",
          status: "running",
          commits_indexed: 12,
          files_processed: 4,
          total_commits: 100,
          progress_percent: 12,
          elapsed_seconds: 60,
          eta_seconds: 440,
        });
        expect(result.current.scanningRepoId).toBe("repo1");
        expect(result.current.syncStatus).toBe("Indexing commits");
      });
    });

    it("clears scan UI state and invalidates stats and repos when completed", async () => {
      const listener = mockScanProgressListen();
      const invalidateQuerySpy = jest.spyOn(queryClient, "invalidateQueries");
      const { result } = renderScanProgressHook();

      await listener.emit({
        repo_id: "repo1",
        scan_run_id: "scan1",
        status: "running",
        commits_indexed: 12,
        files_processed: 4,
        cursor_sha: "commit-a",
        target_head_sha: "commit-z",
        message: "Indexing commits",
      });

      await listener.emit({
        repo_id: "repo1",
        scan_run_id: "scan1",
        status: "completed",
        commits_indexed: 20,
        files_processed: 8,
        cursor_sha: null,
        last_indexed_commit_sha: "commit-z",
        target_head_sha: "commit-z",
        message: "Scan completed",
      });

      await waitFor(() => {
        expect(result.current.scanProgressByRepo.repo1).toMatchObject({
          repo_id: "repo1",
          status: "completed",
          commits_indexed: 20,
          files_processed: 8,
        });
        expect(result.current.scanningRepoId).toBeNull();
        expect(result.current.syncStatus).toBe("");
      });

      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
      expect(invalidateQuerySpy).toHaveBeenCalledWith({ queryKey: ["repos"] });
    });
  });
});
